import 'server-only';
import { SiwcError } from '../siwc-errors.ts';
import { runtimeMode } from '../runtime-mode.ts';
import { siwcAuth } from './siwc.ts';
import { supabaseAuth } from './supabase.ts';
import type { AuthProvider, Identity } from './types.ts';

export type { AuthProvider, Identity };

export function getAuth(): AuthProvider {
  return runtimeMode().auth === 'supabase' ? supabaseAuth : siwcAuth;
}

// 로그인이 필요한 API용. 세션이 없거나 검증되지 않으면 기존과 같은 401 오류를 던진다.
export async function requireIdentity(): Promise<Identity> {
  const identity = await getAuth().getIdentity();
  if (!identity) throw new SiwcError(401, 'session_expired');
  return identity;
}
