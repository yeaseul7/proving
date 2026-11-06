// 인증·AI·저장 위치 조합. 지원하지 않거나 허용되지 않는 조합이면 서버가 요청을 처리하지 않는다.
// 설계: docs/auth-ai-separation.md
//  - 기본(배포와 같음): Google 로그인(Supabase Auth), 사용자 Cloud 프로젝트로 Gemini 호출, DB 직접
//  - AUTH_PROVIDER=siwc: ChatGPT 로그인 + 사용자 플랜. 루프백 주소에서만 켜진다.
export type RuntimeMode =
  | { auth: 'siwc'; ai: 'chatgpt-plan'; store: 'db' | 'remote' }
  | { auth: 'supabase'; ai: 'none'; store: 'db' };

type Env = Record<string, string | undefined>;
const loopback = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?\/?$/;
const https = (value: string | undefined) => { try { return new URL(value ?? '').protocol === 'https:'; } catch { return false; } };

export function resolveRuntimeMode(env: Env): RuntimeMode {
  const auth = env.AUTH_PROVIDER || 'supabase';
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
    // 로컬 개발은 루프백 http를 허용한다. 주소를 지정하지 않으면 lib/site.ts의 기본값(127.0.0.1:3005)이다.
    if (!https(site) && !loopback.test(site || 'http://127.0.0.1:3005')) throw new Error('The hosted site needs an https NEXT_PUBLIC_SITE_URL.');
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      throw new Error('Google sign-in needs NEXT_PUBLIC_SUPABASE_URL and a publishable key.');
    }
    return { auth, ai, store };
  }
  throw new Error(`AUTH_PROVIDER=${auth} is not supported.`);
}

let cached: RuntimeMode | undefined;
export const runtimeMode = () => cached ??= resolveRuntimeMode(process.env);
