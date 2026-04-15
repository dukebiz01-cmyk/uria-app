import { withTransaction } from '../../config/db.js';
import * as signalsRepo from './signals.repository.js';
import * as usersRepo from '../users/users.repository.js';
import { createChatRoom } from '../chat/chat.repository.js';
import { AppError } from '../../utils/AppError.js';
import { escrowHold, processSignalAccept, processSignalRefund, creditPoints } from '../../services/wallet.service.js';
import { sendPushNotification, Notifications } from '../../services/fcm.service.js';
import config from '../../config/index.js';
import { randomUUID } from 'crypto';

export async function sendSignal(senderId, { receiver_id, message }) {
  if (senderId === receiver_id) throw new AppError('SIGNAL_SELF_SEND');

  const sender = await usersRepo.findById(senderId);
  const receiver = await usersRepo.findById(receiver_id);
  if (!sender || sender.status !== 'active') throw new AppError('FORBIDDEN', 'Sender is not active');
  if (!receiver || receiver.status !== 'active') throw new AppError('NOT_FOUND', 'Receiver not found');
  if (sender.gender !== 'M' || receiver.gender !== 'F') {
    throw new AppError('FORBIDDEN', 'Phase 1 only supports M → F signal flow');
  }
  if (await usersRepo.isBlockedBetween(senderId, receiver_id)) {
    throw new AppError('FORBIDDEN', 'This user is not available');
  }

  const existing = await signalsRepo.findRecentSignal(senderId, receiver_id);
  if (existing) throw new AppError('SIGNAL_DUPLICATE');

  const expiresAt = new Date(Date.now() + config.SIGNAL_EXPIRY_HOURS * 3600 * 1000);
  const signalId = randomUUID();

  const signal = await withTransaction(async (client) => {
    await escrowHold(senderId, signalId, config.SIGNAL_ESCROW_COINS, client);
    const sig = await client.query(
      `INSERT INTO signals (id, sender_id, receiver_id, message, status, escrow_coin, expires_at)
       VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING *`,
      [signalId, senderId, receiver_id, message || null, config.SIGNAL_ESCROW_COINS, expiresAt],
    );
    await signalsRepo.addEvent(client, {
      signalId,
      actorId: senderId,
      eventType: 'signal_sent',
      payload: { message: message || null },
    });
    return sig.rows[0];
  });

  sendPushNotification(receiver_id, {
    ...Notifications.signalReceived(sender.nickname),
    data: { signal_id: signal.id },
  }).catch(() => {});

  return signal;
}

export async function respondToSignal(responderId, signalId, action) {
  const result = await withTransaction(async (client) => {
    const signal = await signalsRepo.findByIdForUpdate(signalId, client);
    if (!signal) throw new AppError('NOT_FOUND', 'Signal not found');
    if (signal.receiver_id !== responderId) throw new AppError('FORBIDDEN', 'Only receiver can respond');
    if (!['pending', 'held'].includes(signal.status)) {
      if (['accepted', 'rejected'].includes(signal.status)) throw new AppError('SIGNAL_ALREADY_RESPONDED');
      throw new AppError('SIGNAL_INVALID_STATUS', `Cannot respond to ${signal.status} signal`);
    }

    let chatRoom = null;
    if (action === 'accept') {
      await processSignalAccept(signal.sender_id, signalId, client);
      await signalsRepo.updateStatus(signalId, 'accepted', { accepted_at: new Date() }, client);
      const sender = await usersRepo.findById(signal.sender_id);
      const maleId = sender.gender === 'M' ? signal.sender_id : signal.receiver_id;
      const femaleId = maleId === signal.sender_id ? signal.receiver_id : signal.sender_id;
      chatRoom = await createChatRoom(client, { signalId, maleId, femaleId });
      await creditPoints(responderId, config.SIGNAL_ACCEPT_REWARD_POINTS, 'signal', signalId, `reward:signal_accept:${signalId}:${responderId}`, client);
      await signalsRepo.addEvent(client, { signalId, actorId: responderId, eventType: 'signal_accepted', payload: {} });
    } else if (action === 'reject') {
      await signalsRepo.updateStatus(signalId, 'rejected', {}, client);
      await processSignalRefund(signal.sender_id, signalId, client);
      await signalsRepo.addEvent(client, { signalId, actorId: responderId, eventType: 'signal_rejected', payload: {} });
    } else if (action === 'hold') {
      await signalsRepo.updateStatus(signalId, 'held', { expires_at: new Date(Date.now() + 24 * 3600 * 1000) }, client);
      await signalsRepo.addEvent(client, { signalId, actorId: responderId, eventType: 'signal_held', payload: {} });
    } else {
      throw new AppError('VALIDATION_ERROR', 'Invalid action');
    }

    return { signalId, senderId: signal.sender_id, receiverId: signal.receiver_id, action, chatRoom };
  });

  if (action === 'accept') {
    const responder = await usersRepo.findById(responderId);
    sendPushNotification(result.senderId, {
      ...Notifications.signalAccepted(responder.nickname),
      data: { signal_id: signalId, chat_room_id: result.chatRoom?.id },
    }).catch(() => {});
  } else if (action === 'reject') {
    sendPushNotification(result.senderId, {
      ...Notifications.signalRejected(),
      data: { signal_id: signalId },
    }).catch(() => {});
  }

  return result;
}

export async function cancelSignal(senderId, signalId) {
  return withTransaction(async (client) => {
    const signal = await signalsRepo.findByIdForUpdate(signalId, client);
    if (!signal) throw new AppError('NOT_FOUND', 'Signal not found');
    if (signal.sender_id !== senderId) throw new AppError('FORBIDDEN', 'Only sender can cancel');
    if (signal.status !== 'pending') throw new AppError('SIGNAL_INVALID_STATUS', `Cannot cancel ${signal.status}`);
    await signalsRepo.updateStatus(signalId, 'cancelled', {}, client);
    await processSignalRefund(senderId, signalId, client);
    await signalsRepo.addEvent(client, { signalId, actorId: senderId, eventType: 'signal_cancelled', payload: {} });
    return { cancelled: true };
  });
}

export async function getSignal(userId, signalId) {
  const signal = await signalsRepo.findById(signalId);
  if (!signal) throw new AppError('NOT_FOUND', 'Signal not found');
  if (signal.sender_id !== userId && signal.receiver_id !== userId) throw new AppError('FORBIDDEN');
  return signal;
}

export async function listSignals(userId, queryParams) {
  const { direction, status, cursor, limit = 20 } = queryParams;
  const normalizedDirection = direction === 'outbox' ? 'sent' : direction === 'inbox' ? 'received' : direction;
  const signals = await signalsRepo.listSignals({ userId, direction: normalizedDirection, status, cursor, limit: Number(limit) + 1 });
  const hasMore = signals.length > Number(limit);
  const items = hasMore ? signals.slice(0, Number(limit)) : signals;
  return { items, pagination: { has_more: hasMore, next_cursor: hasMore ? items.at(-1).created_at : null } };
}
