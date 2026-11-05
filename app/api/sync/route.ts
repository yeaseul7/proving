import { transaction } from '@/lib/notebook-server';
import { userForDeviceToken } from '@/lib/devices';
import { runtimeMode } from '@/lib/runtime-mode';
import { StudySyncError } from '@/lib/study-sync';
import { dbStudyStore } from '@/lib/sync/db-store';

export const runtime = 'nodejs';

// 로컬 학습 앱 전용 동기화 API. 브라우저 쿠키가 아니라 기기 토큰(Bearer)으로 인증하며, 의미는 /api/study-sync와 같다.
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function handle(request: Request, write: boolean) {
  try {
    if (runtimeMode().store !== 'db') return json({ error: '이 서버는 동기화를 제공하지 않습니다.' }, 404);
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    const userId = token ? await transaction(db => userForDeviceToken(db, token)) : null;
    if (!userId) return json({ error: '기기 연결이 해제되었거나 올바르지 않습니다.' }, 401);
    if (!write) return json(await dbStudyStore.load({ userId }));
    let body;
    try {
      const raw = await request.text();
      if (raw.length > 5_000_000) return json({ error: '저장할 내용이 너무 깁니다.' }, 413);
      body = JSON.parse(raw);
    } catch { return json({ error: '저장 요청이 올바르지 않습니다.' }, 400); }
    return json(await dbStudyStore.apply({ userId }, body));
  } catch (error) {
    if (error instanceof StudySyncError) return json({ error: error.message }, error.status);
    const { code, constraint } = (error ?? {}) as { code?: unknown; constraint?: unknown };
    console.error('sync failed', { write, code, constraint });
    return json({ error: '공부 기록을 처리하지 못했습니다. 다시 시도해주세요.' }, 503);
  }
}

export const GET = (request: Request) => handle(request, false);
export const POST = (request: Request) => handle(request, true);
