import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { StudyQuery } from './study-users.ts';

// 로컬 학습 앱 ↔ 배포 사이트 연결. 코드와 토큰은 해시만 저장한다.
export const LINK_CODE_TTL_MINUTES = 10;
export const MAX_ACTIVE_DEVICES = 5;
// 헷갈리는 0/O, 1/I/L을 뺀 31자. 12자리 ≈ 59비트라 10분 안에 추측할 수 없다.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{12}$/;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizeLinkCode = (code: unknown) => typeof code === 'string' ? code.replace(/[\s-]/g, '').toUpperCase() : '';
export const formatLinkCode = (code: string) => code.match(/.{1,4}/g)!.join('-');

export function newLinkCode() {
  return Array.from({ length: 12 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

export function cleanDeviceName(name: unknown) {
  const text = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  return text && Array.from(text).length <= 60 ? text : null;
}

export type Device = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

export async function createLinkCode(db: StudyQuery, userId: string) {
  // 이전에 만든 미사용 코드는 무효로 한다. 사용자당 유효한 코드는 하나뿐이다.
  await db.query('UPDATE study.link_codes SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [userId]);
  const code = newLinkCode();
  const { rows: [row] } = await db.query<{ expires_at: Date }>(`
    INSERT INTO study.link_codes (code_hash, user_id, expires_at)
    VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING expires_at
  `, [sha256(code), userId, LINK_CODE_TTL_MINUTES]);
  return { code: formatLinkCode(code), expiresAt: row.expires_at.toISOString() };
}

// 성공하면 새 기기 토큰 원문을 한 번만 돌려준다. 실패 원인은 구분하지 않는다.
export async function redeemLinkCode(db: StudyQuery, rawCode: unknown, rawName: unknown): Promise<{ token: string; deviceId: string } | { error: 'device_limit' } | null> {
  const code = normalizeLinkCode(rawCode);
  const name = cleanDeviceName(rawName);
  if (!CODE_PATTERN.test(code) || !name) return null;
  const { rows: [link] } = await db.query<{ user_id: string }>(`
    SELECT user_id FROM study.link_codes
    WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE
  `, [sha256(code)]);
  if (!link) return null;
  // 기기 수 제한에 걸리면 코드를 쓰지 않은 상태로 남겨, 기기를 정리한 뒤 같은 코드로 다시 연결할 수 있게 한다.
  const { rows: [{ count }] } = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM study.devices WHERE user_id=$1 AND revoked_at IS NULL', [link.user_id]);
  if (count >= MAX_ACTIVE_DEVICES) return { error: 'device_limit' };
  await db.query('UPDATE study.link_codes SET used_at=now() WHERE code_hash=$1', [sha256(code)]);
  const token = randomBytes(32).toString('base64url');
  const { rows: [device] } = await db.query<{ id: string }>(
    'INSERT INTO study.devices (user_id, name, token_hash) VALUES ($1, $2, $3) RETURNING id', [link.user_id, name, sha256(token)]);
  return { token, deviceId: device.id };
}

export async function userForDeviceToken(db: StudyQuery, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { rows: [device] } = await db.query<{ user_id: string }>(`
    UPDATE study.devices SET last_used_at=now()
    WHERE token_hash=$1 AND revoked_at IS NULL RETURNING user_id
  `, [sha256(token)]);
  return device?.user_id ?? null;
}

export async function listDevices(db: StudyQuery, userId: string): Promise<Device[]> {
  const { rows } = await db.query<{ id: string; name: string; created_at: Date; last_used_at: Date | null }>(
    'SELECT id, name, created_at, last_used_at FROM study.devices WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC', [userId]);
  return rows.map(row => ({ id: row.id, name: row.name, createdAt: row.created_at.toISOString(), lastUsedAt: row.last_used_at?.toISOString() ?? null }));
}

export async function revokeDevice(db: StudyQuery, userId: string, deviceId: unknown) {
  if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) return false;
  const { rowCount } = await db.query(
    'UPDATE study.devices SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL', [deviceId, userId]);
  return rowCount === 1;
}
