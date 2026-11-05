import { redeemLinkCode, MAX_ACTIVE_DEVICES } from '@/lib/devices';
import { transaction } from '@/lib/notebook-server';
import { runtimeMode } from '@/lib/runtime-mode';

export const runtime = 'nodejs';

// 로컬 학습 앱이 연결 코드를 기기 토큰으로 바꾼다. 로그인 쿠키 없이 코드만으로 인증하며, 실패 원인은 구분하지 않는다.
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    if (runtimeMode().store !== 'db') return json({ error: '이 서버는 기기 연결을 제공하지 않습니다.' }, 404);
    let input;
    try {
      const raw = await request.text();
      if (raw.length > 1000) return json({ error: '요청이 올바르지 않습니다.' }, 400);
      input = JSON.parse(raw);
    } catch { return json({ error: '요청이 올바르지 않습니다.' }, 400); }
    const result = await transaction(db => redeemLinkCode(db, input?.code, input?.name));
    if (!result) return json({ error: '연결 코드가 올바르지 않거나 만료되었습니다.' }, 400);
    if ('error' in result) return json({ error: `연결된 기기는 ${MAX_ACTIVE_DEVICES}대까지예요. 사용하지 않는 기기의 연결을 끊어주세요.` }, 409);
    return json(result, 201);
  } catch (error) {
    const { code } = (error ?? {}) as { code?: unknown };
    console.error('device link failed', { code });
    return json({ error: '기기를 연결하지 못했습니다. 다시 시도해주세요.' }, 503);
  }
}
