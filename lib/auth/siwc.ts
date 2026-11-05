import 'server-only';
import { NextResponse } from 'next/server';
import { assertLocal, COOKIE, finishLogin, getSession, localOrigin, logout, REGISTRATION_COOKIE, SESSION_MAX_AGE_SECONDS, startLogin, TRANSACTION_COOKIE } from '../chat-auth.ts';
import { errorResponse } from '../siwc-errors.ts';
import { studyAccountFromSession } from '../study-users.ts';
import type { AuthProvider } from './types.ts';

// Sign in with ChatGPT(동적 등록) 로컬 로그인. OAuth·세션 파일·갱신·폐기는 chat-auth.ts가 담당한다.
export const siwcAuth: AuthProvider = {
  provider: 'chatgpt',
  checkRequest: assertLocal,

  async getIdentity() {
    const session = await getSession();
    const accountKey = studyAccountFromSession(session);
    return session && accountKey ? { provider: 'chatgpt', accountKey, name: session.name } : null;
  },

  async startLogin(request) {
    try {
      const { id, url } = await startLogin(request);
      const response = NextResponse.redirect(url);
      response.cookies.set(TRANSACTION_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch { return NextResponse.redirect(new URL('/?auth_error=start', localOrigin(request))); }
  },

  async finishLogin(request) {
    let result: Awaited<ReturnType<typeof finishLogin>>;
    try { result = await finishLogin(request); } catch {
      const response = NextResponse.redirect(new URL('/?auth_error=callback', localOrigin(request)));
      response.cookies.delete(TRANSACTION_COOKIE);
      return response;
    }
    const response = NextResponse.redirect(new URL('/', localOrigin(request)));
    response.cookies.set(COOKIE, result.sessionId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE_SECONDS });
    response.cookies.set(REGISTRATION_COOKIE, result.registration, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 });
    response.cookies.delete(TRANSACTION_COOKIE);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  },

  async logout(request) {
    try {
      assertLocal(request, true);
      const result = await logout();
      const response = NextResponse.json({ signedOut: true, ...result });
      response.cookies.delete(COOKIE);
      return response;
    } catch (error) { return errorResponse(error); }
  },
};
