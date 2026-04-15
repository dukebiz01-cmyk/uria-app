import { withTransaction, query } from '../../config/db.js';
import * as momentsRepo from './moments.repository.js';
import * as signalsRepo from '../signals/signals.repository.js';
import { findById as findUser } from '../users/users.repository.js';
import { AppError } from '../../utils/AppError.js';
import { processMomentComplete, creditPoints } from '../../services/wallet.service.js';
import { recalculateTrustScore } from '../../services/passport.calculator.js';
import { recalculateReputationScore } from '../../services/reputation.calculator.js';
import { sendPushNotification, Notifications, sendToMultiple } from '../../services/fcm.service.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

export async function createMoment(userId, { signal_id }) {
  const signal = await signalsRepo.findById(signal_id);
  if (!signal) throw new AppError('NOT_FOUND', 'Signal not found');
  if (signal.status !== 'accepted') throw new AppError('SIGNAL_INVALID_STATUS', 'Signal must be accepted to create a moment');
  if (signal.sender_id !== userId && signal.receiver_id !== userId) throw new AppError('FORBIDDEN');
  const existing = await momentsRepo.findBySignalId(signal_id);
  if (existing) return existing;

  const sender = await findUser(signal.sender_id);
  const maleId = sender.gender === 'M' ? signal.sender_id : signal.receiver_id;
  const femaleId = maleId === signal.sender_id ? signal.receiver_id : signal.sender_id;

  const moment = await withTransaction(async (client) => momentsRepo.createMoment(client, { signalId: signal_id, maleId, femaleId }));
  const otherUserId = userId === signal.sender_id ? signal.receiver_id : signal.sender_id;
  sendPushNotification(otherUserId, { ...Notifications.momentRequest(), data: { moment_id: moment.id } }).catch(() => {});
  return moment;
}

export async function checkinMoment(userId, momentId, { lat, lng, accuracy_m }) {
  const moment = await momentsRepo.findById(momentId);
  if (!moment) throw new AppError('NOT_FOUND', 'Moment not found');
  if (moment.male_id !== userId && moment.female_id !== userId) throw new AppError('FORBIDDEN');
  if (['verified', 'expired', 'rejected'].includes(moment.status)) throw new AppError('MOMENT_WINDOW_EXPIRED', `Moment is already ${moment.status}`);

  const windowEnd = new Date(moment.created_at.getTime() + config.MOMENT_CHECKIN_WINDOW_MINUTES * 60 * 1000);
  if (new Date() > windowEnd) {
    await momentsRepo.updateStatus(momentId, 'expired', {});
    throw new AppError('MOMENT_WINDOW_EXPIRED');
  }

  const mockLocationFlag = Number(accuracy_m) > config.MOMENT_GPS_ACCURACY_THRESHOLD;
  if (mockLocationFlag) {
    await query(
      `UPDATE user_devices ud
       SET risk_score = ud.risk_score + 5
       WHERE ud.id = (
         SELECT id FROM user_devices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
       )`,
      [userId],
    );
    logger.warn({ userId, momentId, accuracy_m }, 'Mock location suspected');
  }

  const checkin = await momentsRepo.addCheckin(momentId, userId, { lat, lng, accuracy_m, mockLocationFlag });
  const checkinCount = await momentsRepo.getCheckinCount(momentId);
  if (checkinCount === 2) await momentsRepo.updateStatus(momentId, 'checked_in', {});
  return { checkin, both_checked_in: checkinCount === 2 };
}

export async function submitReview(userId, momentId, { reviewee_id, ...evalData }) {
  const moment = await momentsRepo.findById(momentId);
  if (!moment) throw new AppError('NOT_FOUND', 'Moment not found');
  if (moment.male_id !== userId && moment.female_id !== userId) throw new AppError('FORBIDDEN');
  if (moment.status !== 'checked_in') throw new AppError('MOMENT_WINDOW_EXPIRED', `Moment status is ${moment.status}, not checked_in`);

  const validReviewee = (userId === moment.male_id && reviewee_id === moment.female_id) || (userId === moment.female_id && reviewee_id === moment.male_id);
  if (!validReviewee) throw new AppError('VALIDATION_ERROR', 'Invalid reviewee ID');

  await momentsRepo.addReview(momentId, userId, reviewee_id, evalData);
  const reviewCount = await momentsRepo.getReviewCount(momentId);
  let verified = false;

  if (reviewCount >= 2) {
    await withTransaction(async (client) => {
      const signal = await signalsRepo.findById(moment.signal_id);
      await momentsRepo.updateStatus(momentId, 'verified', { verified_at: new Date() }, client);
      await processMomentComplete(signal.sender_id, moment.signal_id, momentId, client);
      await creditPoints(moment.female_id, config.MOMENT_VERIFIED_REWARD_POINTS, 'moment', momentId, `reward:moment_verified:${momentId}:${moment.female_id}`, client);
    });
    verified = true;
    Promise.allSettled([
      recalculateTrustScore(moment.female_id),
      recalculateReputationScore(moment.male_id),
    ]).catch((err) => logger.error({ err, momentId }, 'Score update failed'));
    sendToMultiple([moment.male_id, moment.female_id], { ...Notifications.momentVerified(), data: { moment_id: momentId } }).catch(() => {});
  }

  return { review_submitted: true, moment_verified: verified };
}

export async function getMoment(userId, momentId) {
  const moment = await momentsRepo.findById(momentId);
  if (!moment) throw new AppError('NOT_FOUND', 'Moment not found');
  if (moment.male_id !== userId && moment.female_id !== userId) throw new AppError('FORBIDDEN');
  return moment;
}
