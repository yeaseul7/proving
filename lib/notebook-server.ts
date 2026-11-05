import 'server-only';
import { assertLocal } from './chat-auth.ts';
import { getAuth } from './auth/index.ts';
import { createNotebookApi } from './notebook-api.ts';
import type { StudyQuery } from './study-users.ts';

// 기존 노트 API(/api/notebooks)는 ChatGPT 로그인 계정만 다룬다. 배포 사이트의 Google 계정은 401로 막는다.
export async function getVerifiedStudyAccount(): Promise<string | null> {
  const identity = await getAuth().getIdentity();
  return identity?.provider === 'chatgpt' ? identity.accountKey : null;
}

export async function transaction<T>(work: (db: StudyQuery) => Promise<T>): Promise<T> {
  // 인증 또는 입력 검사 실패 시 DB 연결이나 설정을 초기화하지 않는다.
  const { db } = await import('./db.ts');
  const client = await db.connect();
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}

export const notebookApi = createNotebookApi({ account: getVerifiedStudyAccount, checkOrigin: assertLocal, transaction });
