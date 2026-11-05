import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { StudySession } from './session-store.ts';

export type StudyQuery = Pick<PoolClient, 'query'>;
const accountPattern = /^[a-f0-9]{64}$/;

// finishLogin이 검증된 ID Token의 issuer와 subject로 만든 기존 계정 키다.
export function studyAccountFromSession(session: Pick<StudySession, 'account' | 'subject'> | null): string | null {
  if (!session?.subject.trim() || !accountPattern.test(session.account)) return null;
  const expected = createHash('sha256').update(`https://auth.openai.com:${session.subject}`).digest('hex');
  return session.account === expected ? session.account : null;
}

export async function findOrCreateStudyUser(db: StudyQuery, account: string): Promise<string> {
  if (!accountPattern.test(account)) throw new Error('Verified study account required');
  const lookup = () => db.query<{ id: string }>(
    'SELECT id FROM study.users WHERE oauth_account_id = $1', [account],
  );
  const existing = (await lookup()).rows[0];
  if (existing) return existing.id;
  const inserted = await db.query<{ id: string }>(`
    INSERT INTO study.users (oauth_account_id) VALUES ($1)
    ON CONFLICT (oauth_account_id) DO NOTHING RETURNING id
  `, [account]);
  // 별도 조회이므로 경쟁 요청이 먼저 커밋한 매핑도 읽을 수 있다.
  const user = inserted.rows[0] ?? (await lookup()).rows[0];
  if (!user) throw new Error('Study user unavailable');
  return user.id;
}
