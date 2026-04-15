import { withTransaction, query } from '../../config/db.js';
import * as momentsRepo from './moments.repository.js';
import * as signalsRepo from '../signals/signals.repository.js';
import { findRoomByIdForUser } from '../chat/chat.repository.js';
import { findById as findUser } from '../users/users.repository.js';
import { AppError } from '../../utils/AppError.js';
import { processMomentComplete } from '../../services/wallet.service.js';
import { recalculateTrustScore } from '../../services/passport.calculator.js';
import { sendPushNotification, Notifications } from '../../services/fcm.service.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

/**
 * Create a MOMENT (date request) for an accepted signal.
 * Only chat room participants can create a moment.
 */
export async function createMoment(userId, { signal_id }) {
  const signal = await signalsRepo.findById(signal_id);
  if (!signal) throw new AppError('NOT_FOUND', 'Signal not found');
  if (signal.status !== 'accepted') {
    throw new AppError('SIGNAL_INVALID_STATUS', 'Signal must be accepted to create a moment');
  }

  // Only participants can create
  if (signal.sender_id !== userId && signal.receiver_id !== userId) {
    throw new AppError('FORBIDDEN');
  }

  // Check if moment already exists
  const existing = await momentsRepo.findBySignalId(signal_id);
  if (existing) {
    throw new AppError('MOMENT_ALREADY_CHECKED_IN', 'A moment already exists for this signal');
  }

  // Determine male/female
  const sender = await findUser(signal.sender_id);
  const receiver = await findUser(signal.receiver_id);
  const maleId = sender.gender === 'M' ? signal.sender_id : signal.receiver_id;
  const femaleId = maleId === signal.sender_id ? signal.receiver_id : signal.sender_id;

  const moment = await withTransaction(async (client) => {
    return momentsRepo.createMoment(client, {
      signalId: signal_id,
      maleId,
      femaleId,
    });
  });

  // Notify the other party
  const otherUserId = userId === signal.sender_id ? signal.receiver_id : signal.sender_id;
  sendPushNotification(otherUserId, {
    ...Notifications.momentRequest(),
    data: { moment_id: moment.id },
  }).catch(() => {});

  return moment;
}

/**
 * Check in to a moment (GPS verification).
 * accuracy_m > threshold → mock_location_flag = true
 */
export async function checkinMoment(userId, momentId, { lat, lng, accuracy_m }) {
  const moment = await momentsRepo.findById(momentId);
  if (!moment) throw new AppError('NOT_FOUND', 'Moment not found');

  // Must be a participant
  if (moment.male_id !== userId && moment.female_id !== userId) {
    throw new AppError('FORBIDDEN');
  }

  if (moment.status === 'verified' || moment.status === 'expired' || moment.status === 'rejected') {
    throw new AppError('MOMENT_WINDOW_EXPIRED', `Moment is already ${moment.status}`);
  }

  // Check time window (30 minutes from creation)
  const windowMinutes = config.MOMENT_CHECKIN_WINDOW_MINUTES;
  const windowEnd = new Date(moment.created_at.getTime() + windowMinutes * 60 * 1000);
  if (new Date() > windowEnd) {
    // Auto-expire
    await momentsRepo.updateStatus(momentId, 'expired', {});
    throw new AppError('MOMENT_WINDOW_EXPIRED');
  }

  const mockLocationFlag = accuracy_m > config.MOMENT_GPS_ACCURACY_THRESHOLD;

  if (mockLocationFlag) {
    // Increase risk score for the user's device
    await query(
      `UPDATE user_devices SET risk_score = risk_score + 5
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    logger.warn({ userId, momentId, accuracy_m }, 'Mock location suspected');
  }

  // Add check-in
  const checkin = await momentsRepo.addCheckin(momentId, userId, {
    lat,
    lng,
    accuracy_m,
    mockLocationFlag,
  });

  // Check if both participants have checked in
  const checkinCount = await momentsRepo.getCheckinCount(momentId);
  if (checkinCount === 2) {
    await momentsRepo.updateStatus(momentId, 'checked_in', {});
    logger.info({ momentId }, 'Both participants checked in');
  }

  return { checkin, both_checked_in: checkinCount === 2 };
}

/**
 * Submit a review for a moment.
 * When both parties submit → trigger coin settlement and trust score update.
 */
export async function submitReview(userId, momentId, { reviewee_id, ...evalData }) {
  const moment = await momentsRepo.findById(momentId);
  if (!moment) throw new AppError('NOT_FOUND', 'Moment not found');

  if (moment.male_id !== userId && moment.female_id !== userId) {
    throw new AppError('FORBIDDEN');
  }

  if (moment.status !== 'checked_in') {
    throw new AppError('MOMENT_WINDOW_EXPIRED', `Moment status is ${moment.status}, not checked_in`);
  }

  // Validate reviewee is the other party
  const validReviewee =
    (userId === moment.male_id && reviewee_id === moment.female_id) ||
    (userId === moment.female_id && reviewee_id === moment.male_id);
  if (!validReviewee) {
    throw new AppError('VALIDATION_ERROR', 'Invalid reviewee ID');
  }

  await momentsRepo.addReview(momentId, userId, reviewee_id, evalData);

  // Check if both parties have reviewed
  const reviewCount = await momentsRepo.getReviewCount(momentId);
  let verified = false;

  if (reviewCount >= 2) {
    // Both reviewed → process coin settlement + mark verified
    await withTransaction(async (client) => {
      // Find the signal's sender_id (the one who paid escrow)
      const signal = await signalsRepo.findById(moment.signal_id);
      const verified = await momentsRepo.updateStatus(momentId, 'verified', { verified_at: new Date() }, client);

      await processMomentComplete(signal.sender_id, moment.signal_id, momentId, client);
    });

    verified = true;

    // Recalculate trust scores (async, non-blocking)
    Promise.all([
      recalculateTrustScore(moment.male_id),
      recalculateTrustScore(moment.female_id),
    ]).catch((err) => logger.error({ err, momentId }, 'Trust score update failed'));

    // Notify both
    sendToMultiple([moment.male_id, moment.female_id], {
      ...Notifications.momentVerified(),
      data: { moment_id: momentId },
    }).catch(() => {});
  }

  return { review_submitted: true, moment_verified: verified };
}

export async function getMoment(userId, momentId) {
  const moment = await momentsRepo.findById(momentId);
  if (!moment) throw new AppError('NOT_FOUND', 'Moment not found');
  if (moment.male_id !== userId && moment.female_id !== userId) {
    throw new AppError('FORBIDDEN');
  }
  return moment;
}

// Import for notifications (avoid circular)
async function sendToMultiple(userIds, notification) {
  const { sendToMultiple: _send } = await import('../../services/fcm.service.js');
  return _send(userIds, notification);
}
