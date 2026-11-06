import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkSiteRequest } from '@/lib/auth/supabase-checks';
import { transaction } from '@/lib/notebook-server';
import { validOwnerId } from '@/lib/public-blog';
import { runtimeMode } from '@/lib/runtime-mode';
import { siteUrl } from '@/lib/site';

const visitorCookie = 'proving-visitor';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    checkSiteRequest(request, true);
  } catch {
    return NextResponse.json(null, { status: 403, headers });
  }
  const owner = process.env.SITE_OWNER_USER_ID;
  if (runtimeMode().auth !== 'supabase' || !validOwnerId(owner)) {
    return NextResponse.json(null, { status: 404, headers });
  }
  const currentVisitor = request.headers.get('cookie')?.match(/(?:^|;\s*)proving-visitor=([^;]*)/)?.[1];
  const visitor = validOwnerId(currentVisitor) ? currentVisitor : randomUUID();

  try {
    const counts = await transaction(async db => {
      await db.query(`
        INSERT INTO study.blog_visitors (owner_id, visitor_id, last_visit)
        VALUES ($1, $2, (now() AT TIME ZONE 'Asia/Seoul')::date)
        ON CONFLICT (owner_id, visitor_id) DO UPDATE SET last_visit = EXCLUDED.last_visit
        WHERE blog_visitors.last_visit < EXCLUDED.last_visit
      `, [owner, visitor]);
      const { rows: [row] } = await db.query<{ total: string; today: string }>(`
        SELECT count(*) AS total,
          count(*) FILTER (WHERE last_visit = (now() AT TIME ZONE 'Asia/Seoul')::date) AS today
        FROM study.blog_visitors WHERE owner_id = $1
      `, [owner]);
      return { total: Number(row.total), today: Number(row.today) };
    });
    const response = NextResponse.json(counts, { headers });
    response.cookies.set(visitorCookie, visitor, {
      httpOnly: true, secure: siteUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: 365 * 86400,
    });
    return response;
  } catch {
    return NextResponse.json(null, { status: 503, headers });
  }
}
