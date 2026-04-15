import * as usersRepo from './users.repository.js';
import * as reportsService from '../reports/reports.service.js';
import { AppError } from '../../utils/AppError.js';

export async function getMe(userId) {
  const user = await usersRepo.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const { phone, ...safe } = user;
  return safe;
}

export async function getUser(requesterId, targetId) {
  const user = await usersRepo.findById(targetId);
  if (!user || user.status !== 'active') throw new AppError('NOT_FOUND', 'User not found');
  return {
    id: user.id,
    nickname: user.nickname,
    gender: user.gender,
    birth_year: user.birth_year,
    bio: user.bio,
    profile_photo_url: user.profile_photo_url,
    selfie_verified: user.selfie_verified,
    tonight_on: user.tonight_on,
    tonight_until: user.tonight_until,
  };
}

export async function updateProfile(userId, updates) {
  const user = await usersRepo.updateProfile(userId, updates);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const { phone, ...safe } = user;
  return safe;
}

export const updateMe = updateProfile;

export async function requestSelfieVerification(userId, selfiePhotoUrl) {
  const user = await usersRepo.updateProfile(userId, { selfie_photo_url: selfiePhotoUrl, selfie_verified: false });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  return { pending_review: true };
}

export async function updateLocation(userId, location) {
  await usersRepo.upsertLocation(userId, location);
  return { updated: true };
}

export async function toggleTonightMode(userId, payload) {
  const enabled = typeof payload === 'boolean' ? payload : Boolean(payload.active);
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (enabled && (kstHour < 18 || kstHour >= 24)) {
    throw new AppError('FORBIDDEN', 'TONIGHT MODE is only available from 18:00 to 24:00 KST');
  }
  const until = enabled ? new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + (now.getUTCHours() >= 15 ? 1 : 0),
    15, 0, 0,
  )) : null;
  const user = await usersRepo.setTonightMode(userId, enabled, until);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  return { tonight_on: user.tonight_on, tonight_until: user.tonight_until };
}

export async function listUsers(requesterId, queryParams) {
  const { lat, lng, radius_km, cursor, limit = 20 } = queryParams;
  // FIX #10: 요청자 성별을 보고 반대 성별만 노출
  const requester = await usersRepo.findById(requesterId);
  const oppositeGender = requester?.gender === 'M' ? 'F' : requester?.gender === 'F' ? 'M' : null;
  const rows = await usersRepo.listTonightUsers({
    lat, lng, radius_km, cursor, limit: Number(limit) + 1,
    excludeId: requesterId, oppositeGender,
  });
  const hasMore = rows.length > Number(limit);
  const sliced = hasMore ? rows.slice(0, Number(limit)) : rows;
  const items = sliced.map((u) => ({
    ...u,
    age: new Date().getFullYear() - Number(u.birth_year) + 1,
    trustScore: Number(u.trust_score || 0),
    momentCount: Number(u.moment_verified_count || 0),
    passportTier: u.passport_tier || 'Starter',
    distance_m: u.distance_km != null ? Math.round(Number(u.distance_km) * 1000) : null,
    available: u.tonight_on ? '오늘 가능' : '오프라인',
  }));
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  return { items, pagination: { has_more: hasMore, next_cursor: nextCursor } };
}

export const getNearbyUsers = listUsers;

export async function blockUser(userId, targetUserId) {
  if (userId === targetUserId) throw new AppError('VALIDATION_ERROR', 'Cannot block yourself');
  const target = await usersRepo.findById(targetUserId);
  if (!target) throw new AppError('NOT_FOUND', 'Target user not found');
  await usersRepo.createUserBlock(userId, targetUserId);
  return { blocked: true };
}

export async function reportUser(userId, targetUserId, { reason, details }) {
  const categoryMap = {
    fake_profile: 'fake_profile',
    no_show: 'no_show',
    harassment: 'harassment',
    fraud: 'fraud',
    other: 'other',
  };
  const category = categoryMap[reason] || 'other';
  return reportsService.submitReport(userId, { target_id: targetUserId, category, description: details });
}
