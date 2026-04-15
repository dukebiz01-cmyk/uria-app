import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { authenticateWs } from '../../middleware/auth.js';
import { findRoomByIdForUser, addMessage, markRead } from './chat.repository.js';
import { findById } from '../users/users.repository.js';
import logger from '../../utils/logger.js';

/**
 * WebSocket Chat Handler
 *
 * Connection: /ws/chat/:roomId?token=<jwt_access_token>
 *
 * Message protocol (JSON):
 *   Client → Server:
 *     { type: 'message', content: string }
 *     { type: 'read', timestamp: string }
 *     { type: 'ping' }
 *
 *   Server → Client:
 *     { type: 'message', message: object }
 *     { type: 'read_ack', timestamp: string, reader_id: string }
 *     { type: 'pong' }
 *     { type: 'error', code: string, message: string }
 *     { type: 'connected', room_id: string, user_id: string }
 */

// Map: roomId → Set<{ ws, userId }>
const rooms = new Map();

function getRoomClients(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  return rooms.get(roomId);
}

function broadcastToRoom(roomId, data, excludeUserId) {
  const clients = getRoomClients(roomId);
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.userId !== excludeUserId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

function sendToClient(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Attach WebSocket server to an existing HTTP server.
 * @param {http.Server} server
 */
export function attachWsServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const { pathname, query } = parse(request.url, true);
    const match = pathname.match(/^\/ws\/chat\/([0-9a-f-]{36})$/);

    if (!match) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const roomId = match[1];
    const token = query.token;

    try {
      const user = await authenticateWs(token);

      // Verify room access
      const room = await findRoomByIdForUser(roomId, user.id);
      if (!room) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, { user, room });
      });
    } catch (err) {
      logger.warn({ err: err.message }, 'WS auth failed');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request, { user, room }) => {
    const roomId = room.id;
    const userId = user.id;

    logger.info({ userId, roomId }, 'WS client connected');

    // Register in room
    const clients = getRoomClients(roomId);
    const clientEntry = { ws, userId };
    clients.add(clientEntry);

    sendToClient(ws, { type: 'connected', room_id: roomId, user_id: userId });

    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) ws.ping();
    }, 30000);

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendToClient(ws, { type: 'error', code: 'INVALID_JSON', message: 'Invalid message format' });
        return;
      }

      try {
        if (msg.type === 'ping') {
          sendToClient(ws, { type: 'pong' });
          return;
        }

        if (msg.type === 'message') {
          if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) {
            sendToClient(ws, { type: 'error', code: 'EMPTY_MESSAGE', message: 'Message cannot be empty' });
            return;
          }
          if (msg.content.length > 1000) {
            sendToClient(ws, { type: 'error', code: 'MESSAGE_TOO_LONG', message: 'Message too long' });
            return;
          }

          const dbMessage = await addMessage(roomId, userId, msg.content.trim());
          const sender = await findById(userId);
          const fullMessage = { ...dbMessage, sender_nickname: sender.nickname };

          // Send to sender
          sendToClient(ws, { type: 'message', message: fullMessage });

          // Broadcast to other participants
          broadcastToRoom(roomId, { type: 'message', message: fullMessage }, userId);

          logger.debug({ roomId, userId, messageId: dbMessage.id }, 'WS message sent');
        }

        if (msg.type === 'read') {
          const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
          await markRead(roomId, userId, timestamp);
          broadcastToRoom(roomId, { type: 'read_ack', timestamp, reader_id: userId }, userId);
        }
      } catch (err) {
        logger.error({ err, userId, roomId }, 'WS message processing error');
        sendToClient(ws, { type: 'error', code: 'INTERNAL_ERROR', message: 'Failed to process message' });
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      clients.delete(clientEntry);
      if (clients.size === 0) rooms.delete(roomId);
      logger.info({ userId, roomId }, 'WS client disconnected');
    });

    ws.on('error', (err) => {
      logger.error({ err, userId, roomId }, 'WS error');
    });
  });

  logger.info('WebSocket server attached to /ws/chat/:roomId');
  return wss;
}
