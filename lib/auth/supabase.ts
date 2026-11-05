import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { errorResponse } from '../siwc-errors.ts';
import { checkSiteRequest, emailAllowed } from './supabase-checks.ts';
import { siteUrl } from '../site.ts';
import { accountKeyFor } from '../study-users.ts';
import type { AuthProvider } from './types.ts';

// 배포 사이트의 Google 로그인(Supabase Auth). OpenAI 토큰은 받지도 저장하지도 않는다.
const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = () => (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

async function supabase() {
  const jar = await cookies();
  return createServerClient(supabaseUrl(), publishableKey(), {
    cookies: {
      getAll: () => jar.getAll(),
      // Route Handler에서만 쿠키를 쓸 수 있다. 서버 컴포넌트에서 갱신 쿠키 쓰기는 다음 요청에서 다시 시도된다.
      // 브라우저용 Supabase 클라이언트를 쓰지 않으므로 세션 쿠키를 스크립트에서 읽지 못하게 한다.
      setAll: list => { try { for (const { name, value, options } of list) jar.set(name, value, { ...options, httpOnly: true, secure: true, sameSite: 'lax' }); } catch {} },
    },
  });
}

const redirectHome = (query = '') => NextResponse.redirect(new URL(`/${query}`, siteUrl));

export const supabaseAuth: AuthProvider = {
  provider: 'google',
  checkRequest: checkSiteRequest,

  async getIdentity() {
    const { data: { user } } = await (await supabase()).auth.getUser();
    if (!user || !emailAllowed(user.email)) return null;
    const meta = user.user_metadata ?? {};
    const name = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : user.email ?? '내 계정';
    return { provider: 'google', accountKey: accountKeyFor(`${supabaseUrl()}/auth/v1`, user.id), name };
  },

  async startLogin(request) {
    try {
      checkSiteRequest(request);
      const { data, error } = await (await supabase()).auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('/auth/callback', siteUrl).href, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw error ?? new Error('No OAuth URL');
      const response = NextResponse.redirect(data.url);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch { return redirectHome('?auth_error=start'); }
  },

  async finishLogin(request) {
    try {
      checkSiteRequest(request);
      const code = new URL(request.url).searchParams.get('code');
      if (!code) throw new Error('Missing code');
      const client = await supabase();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (!emailAllowed(data.user?.email)) {
        await client.auth.signOut();
        return redirectHome('?auth_error=not_allowed');
      }
      const response = redirectHome();
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch { return redirectHome('?auth_error=callback'); }
  },

  async logout(request) {
    try {
      checkSiteRequest(request, true);
      await (await supabase()).auth.signOut();
      return NextResponse.json({ signedOut: true, revocationConfirmed: true });
    } catch (error) { return errorResponse(error); }
  },
};
