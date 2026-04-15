/**
 * FCM Push Notification Service — v2 (BUG2 fixed)
 * push_token_hash → push_tokens 테이블 raw_token 사용
 */
import admin from 'firebase-admin';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { query } from '../config/db.js';

let firebaseApp;

function getApp() {
  if (!firebaseApp) {
    if (!config.FIREBASE_PROJECT_ID || !config.FIREBASE_CLIENT_EMAIL || !config.FIREBASE_PRIVATE_KEY) {
      logger.warn('Firebase credentials not configured — FCM disabled');
      return null;
    }
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FIREBASE_PROJECT_ID,
        clientEmail: config.FIREBASE_CLIENT_EMAIL,
        privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  return firebaseApp;
}

// ✅ BUG2 수정: push_tokens 테이블에서 raw_token 조회
export async function sendPushNotification(userId, notification) {
  const app = getApp();
  if (!app) return;

  try {
    const { rows } = await query(
      `SELECT raw_token FROM push_tokens
       WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [userId],
    );
    if (!rows.length) return;

    const message = {
      token: rows[0].raw_token,
      notification: { title: notification.title, body: notification.body },
      data: notification.data
        ? Object.fromEntries(Object.entries(notification.data).map(([k, v]) => [k, String(v)]))
        : {},
      android: { priority: 'high', notification: { sound: 'default', channelId: 'uria_default' } },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
    };

    const result = await admin.messaging(app).send(message);
    logger.debug({ userId, result }, 'Push sent');
  } catch (err) {
    if (err.code === 'messaging/registration-token-not-registered') {
      logger.info({ userId }, 'Removing expired push token');
      await query(
        `DELETE FROM push_tokens WHERE user_id=$1
         AND raw_token=(SELECT raw_token FROM push_tokens WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1)`,
        [userId],
      ).catch(() => {});
    } else {
      logger.warn({ err: err.message, userId }, 'Push failed');
    }
  }
}

export async function sendToMultiple(userIds, notification) {
  await Promise.allSettled(userIds.map((id) => sendPushNotification(id, notification)));
}

export const Notifications = {
  signalReceived: (nick) => ({ title: 'Signal 도착 ✨', body: `${nick}님이 Signal을 보냈습니다` }),
  signalAccepted: (nick) => ({ title: 'Signal 수락됨 🎉', body: `${nick}님이 수락했습니다!` }),
  signalRejected: () => ({ title: 'Signal', body: '상대방이 Signal을 거절했습니다' }),
  newMessage: (nick) => ({ title: nick, body: '새 메시지가 있습니다' }),
  momentRequest: () => ({ title: 'MOMENT 인증 요청', body: '만남 인증을 시작해보세요' }),
  momentVerified: () => ({ title: 'MOMENT 완료 ✦', body: 'Trust Score가 업데이트됐습니다' }),
};
