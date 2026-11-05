import { assertLocal } from '@/lib/chat-auth';
import { getVerifiedStudyAccount, transaction } from '@/lib/notebook-server';
import { loadWorkspace, applyStudyChange, StudySyncError } from '@/lib/study-sync';
import { findOrCreateStudyUser } from '@/lib/study-users';

export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function handle(request: Request, write: boolean) {
  try { assertLocal(request, write); }
  catch { return json({ error: '요청 출처를 확인할 수 없습니다.' }, 403); }
  try {
    const account = await getVerifiedStudyAccount();
    if (!account) return json({ error: '다시 로그인해주세요.' }, 401);
    if (!write) {
      const workspace = await transaction(async db => {
        const userId = await findOrCreateStudyUser(db, account);
        await db.query('SELECT id FROM study.users WHERE id=$1 FOR SHARE', [userId]);
        return loadWorkspace(db, userId);
      });
      return json({ account, ...workspace });
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > 5_000_000) return json({ error: '저장할 내용이 너무 깁니다.' }, 413);
      body = JSON.parse(raw);
    } catch { return json({ error: '저장 요청이 올바르지 않습니다.' }, 400); }
    if (body?.account !== account) return json({ error: '계정이 변경되었습니다.' }, 403);

    const result = await transaction(async db => {
      const userId = await findOrCreateStudyUser(db, account);
      await db.query('SELECT id FROM study.users WHERE id=$1 FOR UPDATE', [userId]);
      return applyStudyChange(db, userId, body);
    });
    return json(result);
  } catch (error) {
    if (error instanceof StudySyncError) return json({ error: error.message }, error.status);
    // 오류 원문에는 접속 정보나 사용자 내용이 포함될 수 있어 코드와 제약조건 이름만 남긴다.
    const { code, constraint } = (error ?? {}) as { code?: unknown; constraint?: unknown };
    console.error('study-sync failed', { write, code, constraint, name: (error as Error)?.name });
    return json({ error: '서버 공부 기록을 처리하지 못했습니다. 다시 시도해주세요.' }, 503);
  }
}

export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
