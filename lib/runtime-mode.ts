// 인증·AI·저장 위치 조합. 지원하지 않거나 허용되지 않는 조합이면 서버가 요청을 처리하지 않는다.
// 설계: docs/auth-ai-separation.md
//  - 로컬 학습 앱: ChatGPT 로그인 + 사용자 플랜, 저장은 DB 직접(운영자) 또는 배포 사이트 동기화 API
//  - 배포 사이트: Google 로그인(Supabase Auth), AI 없음, DB 직접
export type RuntimeMode =
  | { auth: 'siwc'; ai: 'chatgpt-plan'; store: 'db' | 'remote' }
  | { auth: 'supabase'; ai: 'none'; store: 'db' };

type Env = Record<string, string | undefined>;
const loopback = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?\/?$/;
const https = (value: string | undefined) => { try { return new URL(value ?? '').protocol === 'https:'; } catch { return false; } };

export function resolveRuntimeMode(env: Env): RuntimeMode {
  const auth = env.AUTH_PROVIDER || 'siwc';
  const site = env.NEXT_PUBLIC_SITE_URL;
  if (auth === 'siwc') {
    const ai = env.AI_PROVIDER || 'chatgpt-plan';
    const store = env.STUDY_STORE || 'db';
    if (ai !== 'chatgpt-plan') throw new Error(`AI_PROVIDER=${ai} is not supported with ChatGPT sign-in.`);
    if (store !== 'db' && store !== 'remote') throw new Error(`STUDY_STORE=${store} is not supported.`);
    // 사용자 ChatGPT 플랜 사용은 로컬 실행 전용이다. 공개 주소로 배포된 서버에서는 켜지 않는다.
    if (site && !loopback.test(site)) throw new Error('ChatGPT sign-in and plan usage run only on a local loopback address.');
    if (store === 'remote' && !https(env.PROVING_SYNC_URL)) throw new Error('STUDY_STORE=remote needs an https PROVING_SYNC_URL.');
    return { auth, ai, store };
  }
  if (auth === 'supabase') {
    const ai = env.AI_PROVIDER || 'none';
    const store = env.STUDY_STORE || 'db';
    if (ai !== 'none') throw new Error(`AI_PROVIDER=${ai} is not supported on the hosted site yet.`);
    if (store !== 'db') throw new Error('The hosted site stores study data in its own database.');
    if (!https(site)) throw new Error('The hosted site needs an https NEXT_PUBLIC_SITE_URL.');
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      throw new Error('Google sign-in needs NEXT_PUBLIC_SUPABASE_URL and a publishable key.');
    }
    return { auth, ai, store };
  }
  throw new Error(`AUTH_PROVIDER=${auth} is not supported.`);
}

let cached: RuntimeMode | undefined;
export const runtimeMode = () => cached ??= resolveRuntimeMode(process.env);
