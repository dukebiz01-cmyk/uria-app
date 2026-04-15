import * as usersRepo from './users.repository.js';
import { AppError } from '../../utils/AppError.js';
import config from '../../config/index.js';

export async function getMe(userId) {
  const user = await usersRepo.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const { phone, ...safe } = user;
  return safe;
}

export async function getUser(requesterId, targetId) {
  const user = await usersRepo.findById(targetId);
  if (!user || user.status !== 'active') {
    throw new AppError('NOT_FOUND', 'User not found');
  }
  // Return limited public profile
  return {
    id: user.id,
    nickname: user.nickname,
    gender: user.gender,
    birth_year: user.birth_year,
    profile_photo_url: user.profile_photo_url,
    selfie_verified: user.selfie_verified,
    tonight_on: user.tonight_on,
  };
}

export async function updateProfile(userId, updates) {
  const user = await usersRepo.updateProfile(userId, updates);
  const { phone, ...safe } = user;
  return safe;
}

export async function updateLocation(userId, location) {
  await usersRepo.upsertLocation(userId, location);
  return { updated: true };
}

export async function toggleTonightMode(userId, enabled) {
  // TONIGHT MODE only available 18:00~24:00 KST
  const now = new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;

  if (enabled && (kstHour < 18)) {
    throw new AppError('FORBIDDEN', 'TONIGHT MODE is only available from 18:00 to 24:00 KST');
  }

  const until = enabled
    ? new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + (now.getUTCHours() >= 15 ? 1 : 0), // midnight KST = 15:00 UTC
        15, 0, 0,
      ))
    : null;

  const user = await usersRepo.setTonightMode(userId, enabled, until);
  return { tonight_on: user.tonight_on, tonight_until: user.tonight_until };
}

export async function listUsers(requesterId, queryParams) {
  const { lat, lng, radius_km, cursor, limit } = queryParams;
  const users = await usersRepo.listTonightUsers({
    lat,
    lng,
    radius_km,
    cursor,
    limit: limit + 1,
    excludeId: requesterId,
  });

  const hasMore = users.length > limit;
  const items = hasMore ? users.slice(0, limit) : users;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return {
    items,
    pagination: { has_more: hasMore, next_cursor: nextCursor },
  };
}
