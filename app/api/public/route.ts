import { transaction } from '@/lib/notebook-server';
import { readPublicBlog, validOwnerId } from '@/lib/public-blog';
import { runtimeMode } from '@/lib/runtime-mode';

export const runtime = 'nodejs';

// 배포 사이트 방문자용 읽기 전용 블로그 데이터. 로그인 없이 소유자(SITE_OWNER_USER_ID)의 공부 요약만 반환한다.
export async function GET() {
  try {
    const ownerId = process.env.SITE_OWNER_USER_ID;
    if (runtimeMode().auth !== 'supabase' || !validOwnerId(ownerId)) {
      return Response.json({ error: '공개 블로그가 설정되지 않았습니다.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const blog = await transaction(db => readPublicBlog(db, ownerId));
    return Response.json(blog, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } });
  } catch (error) {
    const { code } = (error ?? {}) as { code?: unknown };
    console.error('public blog failed', { code });
    return Response.json({ error: '기록을 불러오지 못했습니다.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
