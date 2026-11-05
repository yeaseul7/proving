import { getAuth } from '@/lib/auth';
import { createLinkCode, listDevices, revokeDevice } from '@/lib/devices';
import { transaction } from '@/lib/notebook-server';
import { runtimeMode } from '@/lib/runtime-mode';
import { findOrCreateStudyUser } from '@/lib/study-users';

export const runtime = 'nodejs';

// 배포 사이트의 "연결된 기기". 로그인한 사용자만 자신의 기기를 보고 연결 코드를 만들거나 연결을 끊는다.
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function handle(request: Request, action: 'list' | 'code' | 'revoke') {
  const auth = getAuth();
  try { auth.checkRequest(request, action !== 'list'); }
  catch { return json({ error: '요청 출처를 확인할 수 없습니다.' }, 403); }
  try {
    if (runtimeMode().store !== 'db') return json({ error: '기기 연결은 배포 사이트에서 관리해주세요.' }, 409);
    const identity = await auth.getIdentity();
    if (!identity) return json({ error: '다시 로그인해주세요.' }, 401);
    let id: unknown;
    if (action === 'revoke') {
      try { ({ id } = JSON.parse(await request.text())); }
      catch { return json({ error: '요청이 올바르지 않습니다.' }, 400); }
    }
    return json(await transaction(async db => {
      const userId = await findOrCreateStudyUser(db, identity.accountKey, identity.provider);
      if (action === 'code') return createLinkCode(db, userId);
      if (action === 'revoke' && !await revokeDevice(db, userId, id)) return { revoked: false };
      return { devices: await listDevices(db, userId) };
    }));
  } catch (error) {
    const { code } = (error ?? {}) as { code?: unknown };
    console.error('devices failed', { action, code });
    return json({ error: '기기 연결을 처리하지 못했습니다. 다시 시도해주세요.' }, 503);
  }
}

export const GET = (request: Request) => handle(request, 'list');
export const POST = (request: Request) => handle(request, 'code');
export const DELETE = (request: Request) => handle(request, 'revoke');
