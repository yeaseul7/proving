import 'server-only';
import { checkSiteRequest } from './supabase-checks.ts';
import type { AuthProvider } from './types.ts';

export const publicAuth: AuthProvider = {
  provider: 'public',
  checkRequest: checkSiteRequest,
  async getIdentity() { return null; },
  async startLogin() { return new Response(null, { status: 404 }); },
  async finishLogin() { return new Response(null, { status: 404 }); },
  async logout(request) {
    checkSiteRequest(request, true);
    return Response.json({ signedOut: true });
  },
};
