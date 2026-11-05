import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { StudySyncError } from '../study-sync.ts';
import type { StudyStore } from './types.ts';

// 로컬 학습 앱이 배포 사이트의 /api/sync로 노트·기록을 읽고 쓴다. 토큰은 `npm run link`가 .local/sync.json에 저장한다.
export const SYNC_FILE = path.join(process.cwd(), '.local', 'sync.json');

async function deviceToken() {
  try {
    const { token } = JSON.parse(await readFile(SYNC_FILE, 'utf8'));
    if (typeof token === 'string' && token) return token;
  } catch {}
  throw new StudySyncError('배포 사이트와 연결되지 않았습니다. `npm run link -- <연결 코드>`로 이 기기를 연결해주세요.', 401);
}

async function call(init?: { method: 'POST'; body: string }) {
  const token = await deviceToken();
  let response: Response;
  try {
    response = await fetch(new URL('/api/sync', process.env.PROVING_SYNC_URL), {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new StudySyncError('배포 사이트에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.', 503); }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new StudySyncError('이 기기의 연결이 해제되었습니다. 배포 사이트에서 새 연결 코드를 받아 다시 연결해주세요.', 401);
  if (!response.ok) throw new StudySyncError(typeof data.error === 'string' ? data.error : '배포 사이트에 저장하지 못했습니다.', response.status);
  return data;
}

// 사용자는 기기 토큰으로 정해진다. 로컬 로그인 신원은 브라우저 저장소 구분에만 쓰인다.
export const remoteStudyStore: StudyStore = {
  load: () => call(),
  apply: (_owner, change) => call({ method: 'POST', body: JSON.stringify(change) }),
};
