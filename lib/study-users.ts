import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { StudySession } from './session-store.ts';

export type StudyQuery = Pick<PoolClient, 'query'>;
export type IdentityProvider = 'chatgpt' | 'google';
const accountPattern = /^[a-f0-9]{64}$/;

export const accountKeyFor = (issuer: string, subject: string) => createHash('sha256').update(`${issuer}:${subject}`).digest('hex');

// finishLogin이 검증된 ID Token의 issuer와 subject로 만든 기존 계정 키다.
export function studyAccountFromSession(session: Pick<StudySession, 'account' | 'subject'> | null): string | null {
  if (!session?.subject.trim() || !accountPattern.test(session.account)) return null;
  return session.account === accountKeyFor('https://auth.openai.com', session.subject) ? session.account : null;
}

// 검증된 로그인 신원으로 내부 사용자를 찾고, 없으면 만든다. 트랜잭션 안에서 호출해야 한다.
export async function findOrCreateStudyUser(db: StudyQuery, account: string, provider: IdentityProvider = 'chatgpt'): Promise<string> {
  if (!accountPattern.test(account)) throw new Error('Verified study account required');
  const lookup = async () => (await db.query<{ user_id: string }>(
    'SELECT user_id FROM study.user_identities WHERE provider = $1 AND account_key = $2', [provider, account],
  )).rows[0]?.user_id;
  const existing = await lookup();
  if (existing) return existing;
  // 같은 신원의 동시 첫 요청이 사용자를 두 번 만들지 않도록 트랜잭션 끝까지 잠근다.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 18051003))', [`${provider}:${account}`]);
  const raced = await lookup();
  if (raced) return raced;
  const { rows: [user] } = await db.query<{ id: string }>(
    'INSERT INTO study.users (oauth_account_id) VALUES ($1) RETURNING id', [provider === 'chatgpt' ? account : null]);
  await db.query('INSERT INTO study.user_identities (user_id, provider, account_key) VALUES ($1, $2, $3)', [user.id, provider, account]);
  return user.id;
}
