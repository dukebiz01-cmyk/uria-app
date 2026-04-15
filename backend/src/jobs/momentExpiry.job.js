import cron from 'node-cron';
import { bulkExpireCheckedIn } from '../modules/moments/moments.repository.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Moment Expiry Job
 * Runs every minute.
 * Expires moments that have passed their check-in window (30 minutes default).
 *
 * Moments in 'pending' or 'checked_in' status that are older than
 * MOMENT_CHECKIN_WINDOW_MINUTES are expired.
 */
export function startMomentExpiryJob() {
  const task = cron.schedule('* * * * *', async () => {
    try {
      const windowMinutes = config.MOMENT_CHECKIN_WINDOW_MINUTES;
      const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

      const expired = await bulkExpireCheckedIn(cutoff);

      if (!expired.length) return;

      logger.info(
        { count: expired.length, cutoff: cutoff.toISOString() },
        'Moment expiry job: expired moments',
      );

      // Note: For expired moments, no coin refund logic is triggered here
      // because escrow was already held on signal send.
      // The full escrow refund happens when the signal expires, not the moment.
      // If moment expires but signal was already 'accepted', the 1-coin charge stays.
      // This is by design: the acceptance fee (1 coin) is non-refundable.
    } catch (err) {
      logger.error({ err }, 'Moment expiry job: unhandled error');
    }
  });

  logger.info('Moment expiry job started (runs every minute)');
  return task;
}
