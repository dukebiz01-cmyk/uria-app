import cron from 'node-cron';
import { bulkExpire } from '../modules/signals/signals.repository.js';
import { processSignalRefund } from '../services/wallet.service.js';
import { withTransaction } from '../config/db.js';
import logger from '../utils/logger.js';

/**
 * Signal Expiry Job
 * Runs every minute to expire overdue signals and refund escrow coins.
 *
 * Signals that are still 'pending' after their expires_at are:
 * 1. Updated to 'expired'
 * 2. Sender gets full escrow refund (3 coins)
 */
export function startSignalExpiryJob() {
  const task = cron.schedule('* * * * *', async () => {
    try {
      const expired = await bulkExpire(new Date());

      if (!expired.length) return;

      logger.info({ count: expired.length }, 'Signal expiry job: expiring signals');

      // Refund escrow for each expired signal
      const results = await Promise.allSettled(
        expired.map(({ id: signalId, sender_id }) =>
          withTransaction(async (client) => {
            await processSignalRefund(sender_id, signalId, client);
          }).catch((err) => {
            // Skip idempotency conflicts (already refunded)
            if (err.code === '23505') return; // unique constraint
            throw err;
          }),
        ),
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length) {
        logger.error(
          { failures: failures.map((f) => f.reason?.message) },
          'Signal expiry job: some refunds failed',
        );
      }

      logger.info(
        { total: expired.length, failed: failures.length },
        'Signal expiry job complete',
      );
    } catch (err) {
      logger.error({ err }, 'Signal expiry job: unhandled error');
    }
  });

  logger.info('Signal expiry job started (runs every minute)');
  return task;
}
