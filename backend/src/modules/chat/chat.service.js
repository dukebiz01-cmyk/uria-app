import * as chatRepo from './chat.repository.js';
import { AppError } from '../../utils/AppError.js';
import { sendPushNotification, Notifications } from '../../services/fcm.service.js';
import { findById } from '../users/users.repository.js';

export async function getRooms(userId) {
  return chatRepo.listRoomsForUser(userId);
}

export async function getRoomMessages(userId, roomId, queryParams) {
  const room = await chatRepo.findRoomByIdForUser(roomId, userId);
  if (!room) throw new AppError('NOT_FOUND', 'Chat room not found');

  const { cursor, limit = 30 } = queryParams;
  const messages = await chatRepo.listMessages(roomId, {
    cursor,
    limit: parseInt(limit) + 1,
  });

  const hasMore = messages.length > parseInt(limit);
  const items = hasMore ? messages.slice(0, parseInt(limit)) : messages;
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;

  // Mark as read
  await chatRepo.markRead(roomId, userId, new Date());

  return {
    room,
    messages: items,
    pagination: { has_more: hasMore, next_cursor: nextCursor },
  };
}

export async function sendMessage(userId, roomId, content) {
  const room = await chatRepo.findRoomByIdForUser(roomId, userId);
  if (!room) throw new AppError('NOT_FOUND', 'Chat room not found');
  if (room.status !== 'active') throw new AppError('FORBIDDEN', 'Chat room is not active');

  const message = await chatRepo.addMessage(roomId, userId, content);

  // Push notification to the other participant
  const otherUserId = room.male_id === userId ? room.female_id : room.male_id;
  const sender = await findById(userId);
  const preview = content.length > 50 ? content.slice(0, 47) + '...' : content;

  sendPushNotification(otherUserId, {
    ...Notifications.newMessage(sender.nickname, preview),
    data: { room_id: roomId, message_id: message.id },
  }).catch(() => {});

  return message;
}
