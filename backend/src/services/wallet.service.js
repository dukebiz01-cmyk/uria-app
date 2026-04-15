/**
 * URIA SAFE BET Wallet Service — v2 (BUG1 fixed)
 *
 * 올바른 코인 흐름:
 *   SIGNAL 전송  : escrow_hold  -3  (잔액 차감)
 *   SIGNAL 수락  : accept_mark   0  (잔액 변동 없음 — BUG1 수정)
 *   MOMENT 완료  : escrow_release +1 (1코인 환불)
 *   거절/만료    : escrow_release +3 (전액 환불)
 *
 *   최종 순 비용 = 3 - 1 = 2코인 ✅
 */
import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

export async function getWalletForUpdate(userId, client) {
  const { rows } = await client.query(
    'SELECT coin_balance, point_balance FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId],
  );
  if (!rows.length) {
    const { rows: nr } = await client.query(
      `INSERT INTO wallets (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING coin_balance, point_balance`,
      [userId],
    );
    return nr[0];
  }
  return rows[0];
}

async function recordLedgerEntry(client, {
  userId, assetType, entryType, amount, refType, refId, idempotencyKey,
}) {
  const { rows: wr } = await client.query(
    'SELECT coin_balance, point_balance FROM wallets WHERE user_id = $1',
    [userId],
  );
  const wallet = wr[0];
  const cur = assetType === 'coin' ? wallet.coin_balance : wallet.point_balance;
  const next = cur + amount;

  if (next < 0) {
    throw new AppError('INSUFFICIENT_COINS',
      `Insufficient ${assetType}: has ${cur}, needs ${Math.abs(amount)}`);
  }

  const field = assetType === 'coin' ? 'coin_balance' : 'point_balance';
  await client.query(
    `UPDATE wallets SET ${field} = $1, updated_at = NOW() WHERE user_id = $2`,
    [next, userId],
  );

  const { rows: lr } = await client.query(
    `INSERT INTO wallet_ledger
       (user_id, asset_type, entry_type, amount, balance_after,
        ref_type, ref_id, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [userId, assetType, entryType, amount, next, refType, refId, idempotencyKey],
  );
  if (!lr.length) logger.info({ idempotencyKey }, 'Ledger idempotent skip');
  return { newBalance: next, entryId: lr[0]?.id };
}

export async function escrowHold(userId, signalId, coins = 3, client) {
  const exec = async (c) => {
    await getWalletForUpdate(userId, c);
    return recordLedgerEntry(c, {
      userId, assetType: 'coin', entryType: 'escrow_hold',
      amount: -coins, refType: 'signal', refId: signalId,
      idempotencyKey: `escrow_hold:${signalId}:${userId}`,
    });
  };
  return client ? exec(client) : withTransaction(exec);
}

export async function escrowRelease(userId, signalId, coins = 3, client) {
  const exec = async (c) =>
    recordLedgerEntry(c, {
      userId, assetType: 'coin', entryType: 'escrow_release',
      amount: +coins, refType: 'signal', refId: signalId,
      idempotencyKey: `escrow_release:${signalId}:${userId}`,
    });
  return client ? exec(client) : withTransaction(exec);
}

// ✅ BUG1 수정: 수락 시 잔액 추가 차감 없음
export async function processSignalAccept(senderId, signalId, client) {
  await client.query(
    `INSERT INTO wallet_ledger
       (user_id, asset_type, entry_type, amount, balance_after,
        ref_type, ref_id, idempotency_key)
     SELECT $1,'coin','charge',0,coin_balance,'signal',$2,$3
     FROM wallets WHERE user_id=$1
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [senderId, signalId, `accept_mark:${signalId}:${senderId}`],
  );
}

// ✅ BUG1 수정: 1코인 환불만 (순비용 2코인)
export async function processMomentComplete(senderId, signalId, momentId, client) {
  await getWalletForUpdate(senderId, client);
  await recordLedgerEntry(client, {
    userId: senderId, assetType: 'coin', entryType: 'escrow_release',
    amount: +1, refType: 'moment', refId: momentId,
    idempotencyKey: `escrow_release:moment:${momentId}:${senderId}`,
  });
}

export async function processSignalRefund(senderId, signalId, client) {
  await recordLedgerEntry(client, {
    userId: senderId, assetType: 'coin', entryType: 'escrow_release',
    amount: +3, refType: 'signal', refId: signalId,
    idempotencyKey: `escrow_release:full:${signalId}:${senderId}`,
  });
}

export async function creditCoins(userId, coins, entryType, refType, refId, idempotencyKey, client) {
  const exec = async (c) => {
    await c.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    return recordLedgerEntry(c, {
      userId, assetType: 'coin', entryType,
      amount: +coins, refType, refId, idempotencyKey,
    });
  };
  return client ? exec(client) : withTransaction(exec);
}

export async function creditPoints(userId, points, refType, refId, idempotencyKey, client) {
  const exec = async (c) => {
    await c.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    return recordLedgerEntry(c, {
      userId, assetType: 'point', entryType: 'reward',
      amount: +points, refType, refId, idempotencyKey,
    });
  };
  return client ? exec(client) : withTransaction(exec);
}

export async function getBalance(userId) {
  const { rows } = await query(
    'SELECT coin_balance, point_balance FROM wallets WHERE user_id = $1', [userId],
  );
  return rows[0] || { coin_balance: 0, point_balance: 0 };
}
