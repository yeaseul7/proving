// 인증·AI·저장 위치 조합. 지원하지 않거나 허용되지 않는 조합이면 서버가 요청을 처리하지 않는다.
// 설계: docs/auth-ai-separation.md
export type RuntimeMode = { auth: 'siwc'; ai: 'chatgpt-plan'; store: 'db' };

type Env = Record<string, string | undefined>;
const loopback = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?\/?$/;

export function resolveRuntimeMode(env: Env): RuntimeMode {
  const auth = env.AUTH_PROVIDER || 'siwc';
  const ai = env.AI_PROVIDER || 'chatgpt-plan';
  const store = env.STUDY_STORE || 'db';
  if (auth !== 'siwc') throw new Error(`AUTH_PROVIDER=${auth} is not supported yet.`);
  if (ai !== 'chatgpt-plan') throw new Error(`AI_PROVIDER=${ai} is not supported yet.`);
  if (store !== 'db') throw new Error(`STUDY_STORE=${store} is not supported yet.`);
  // 사용자 ChatGPT 플랜 사용은 로컬 실행 전용이다. 공개 주소로 배포된 서버에서는 켜지 않는다.
  const site = env.NEXT_PUBLIC_SITE_URL;
  if (site && !loopback.test(site)) throw new Error('ChatGPT sign-in and plan usage run only on a local loopback address.');
  return { auth, ai, store };
}

let cached: RuntimeMode | undefined;
export const runtimeMode = () => cached ??= resolveRuntimeMode(process.env);
