import { getAuth } from '@/lib/auth';
import { getVerifiedStudyAccount, transaction } from '@/lib/notebook-server';
import { parseProfileInput } from '@/lib/profile';
import { ProfileError, readOwnProfile, saveProfile } from '@/lib/profile-db';
import { findOrCreateStudyUser } from '@/lib/study-users';

export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function handle(request: Request, write: boolean) {
  try { getAuth().checkRequest(request, write); }
  catch { return json({ error: '요청 출처를 확인할 수 없습니다.' }, 403); }
  try {
    const account = await getVerifiedStudyAccount();
    if (!account) return json({ error: '다시 로그인해주세요.' }, 401);
    if (!write) {
      const profile = await transaction(async db => readOwnProfile(db, await findOrCreateStudyUser(db, account)));
      return json({ profile });
    }

    let input;
    try {
      const raw = await request.text();
      if (raw.length > 20_000) return json({ error: '소개글이 너무 깁니다.' }, 413);
      input = parseProfileInput(JSON.parse(raw));
    } catch { return json({ error: '프로필 입력이 올바르지 않습니다.' }, 400); }
    if (typeof input === 'string') return json({ error: input }, 400);
    const profile = await transaction(async db => saveProfile(db, await findOrCreateStudyUser(db, account), input));
    return json({ profile });
  } catch (error) {
    if (error instanceof ProfileError) return json({ error: error.message }, error.status);
    const { code } = (error ?? {}) as { code?: unknown };
    console.error('profile failed', { write, code });
    return json({ error: '프로필을 처리하지 못했습니다. 다시 시도해주세요.' }, 503);
  }
}

export const GET = (request: Request) => handle(request, false);
export const PUT = (request: Request) => handle(request, true);
