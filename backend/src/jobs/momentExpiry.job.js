import cron from 'node-cron';
import { bulkExpireCheckedIn } from '../modules/moments/moments.repository.js';
import { processMomentComplete } from '../services/wallet.service.js';
import { withTransaction } from '../config/db.js';
import { query } from '../config/db.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Moment Expiry Job
 * Runs every minute.
 * Expires moments past the check-in window (default 30 min).
 *
 * SAFE BET v3 (FIX #29):
 *   - Signal escrow: -3C (sender)
 *   - Signal accept: 0C
 *   - Moment verified: +1C refund (net cost 2C)
 *   - Moment expired: +1C refund still given (no-show penalty handled via reputation)
 *     → 정책 일관성: signal accepted 후 moment 단계에서 +1C 환불 보장
 *     → no-show는 reputation_score 하락으로 처벌 (별도 메커니즘)
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

      // FIX #29: signal sender에게 +1C 환불 (moment 완료 시와 동일 처리)
      const results = await Promise.allSettled(
        expired.map(async (moment) => {
          // signals 테이블에서 sender_id 가져오기
          const { rows: sigRows } = await query(
            'SELECT sender_id FROM signals WHERE id = $1',
            [moment.signal_id],
          );
          if (!sigRows.length) return;
          const senderId = sigRows[0].sender_id;
          await withTransaction(async (client) => {
            await processMomentComplete(senderId, moment.signal_id, moment.id, client);
          }).catch((err) => {
            if (err.code === '23505') return; // 이미 환불됨 (idempotency)
            throw err;
          });
        }),
      );

      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length) {
        logger.error(
          { failures: failures.map((f) => f.reason?.message) },
          'Moment expiry job: some refunds failed',
        );
      }

      logger.info(
        { total: expired.length, refunded: expired.length - failures.length },
        'Moment expiry job complete',
      );
    } catch (err) {
      logger.error({ err }, 'Moment expiry job: unhandled error');
    }
  });

  logger.info('Moment expiry job started (runs every minute)');
  return task;
}
