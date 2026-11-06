import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import { runtimeMode } from './runtime-mode.ts';
import { siteUrl } from './site.ts';
import type { ChatMessage } from './chat.ts';

const scope = 'https://www.googleapis.com/auth/cloud-platform';
const validProject = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value);
const stateCookie = 'proving-cloud-state';
const grantCookie = 'proving-cloud-grant';
const cookieOptions = { httpOnly: true, secure: siteUrl.protocol === 'https:', sameSite: 'lax' as const, path: '/' };

function config() {
  if (runtimeMode().auth !== 'supabase') return null;
  const { GOOGLE_CLOUD_OAUTH_CLIENT_ID: clientId, GOOGLE_CLOUD_OAUTH_CLIENT_SECRET: secret,
    GOOGLE_CLOUD_OAUTH_COOKIE_KEY: encodedKey,
    GOOGLE_CLOUD_LOCATION: location = 'global', GOOGLE_CLOUD_GEMINI_MODEL: gemini } = process.env;
  if (!clientId || !secret || !encodedKey ||
      !/^[a-z0-9-]+$/.test(location) || !gemini ||
      !/^[a-zA-Z0-9._@-]{1,120}$/.test(gemini)) return null;
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) return null;
  return { clientId, secret, key, location, gemini, callback: new URL('/auth/google-cloud/callback', siteUrl).href };
}

export class CloudAiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

async function cloudGrant(account: string, settings: NonNullable<ReturnType<typeof config>>) {
  const grant = (await cookies()).get(grantCookie)?.value;
  if (!grant) return null;
  try {
    const { payload } = await jwtDecrypt(grant, settings.key, {
      audience: `proving-gemini:${settings.clientId}`,
      subject: account, keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
      requiredClaims: ['exp'],
    });
    return typeof payload.access === 'string' && validProject(payload.project)
      ? { access: payload.access, project: payload.project } : null;
  } catch { return null; }
}

export async function cloudAiStatus(account: string) {
  const settings = config();
  if (!settings) return { enabled: false, models: [] };
  const models = await cloudGrant(account, settings) ? [
    { id: 'cloud:gemini', provider: 'gemini', name: `${settings.gemini} (Google Cloud)` },
  ] : [];
  return { enabled: true, models };
}

export async function beginCloudAuthorization(account: string, project: string | null) {
  const settings = config();
  if (!settings) throw new CloudAiError('Google Cloud 연결 설정이 필요합니다.', 503, 'cloud_not_configured');
  if (!validProject(project)) throw new CloudAiError('유효한 프로젝트 ID를 입력해주세요.', 400, 'cloud_project_invalid');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const sealed = await new EncryptJWT({ state, verifier, project }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setSubject(account).setAudience(`proving-cloud-state:${settings.clientId}`).setExpirationTime('10m').encrypt(settings.key);
  (await cookies()).set(stateCookie, sealed, { ...cookieOptions, maxAge: 600 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: settings.clientId, redirect_uri: settings.callback, response_type: 'code',
    scope, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return url;
}

export async function finishCloudAuthorization(account: string, params: URLSearchParams) {
  const settings = config();
  const jar = await cookies();
  const sealed = jar.get(stateCookie)?.value;
  jar.delete(stateCookie);
  const code = params.get('code');
  if (!settings || !sealed || !code || params.has('error')) throw new Error('Cloud authorization incomplete');
  const { payload } = await jwtDecrypt(sealed, settings.key, {
    subject: account, audience: `proving-cloud-state:${settings.clientId}`, requiredClaims: ['exp'],
    keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
  });
  if (payload.state !== params.get('state') || typeof payload.verifier !== 'string' || !validProject(payload.project)) throw new Error('Invalid cloud state');
  const result = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({
      client_id: settings.clientId, client_secret: settings.secret, redirect_uri: settings.callback,
      grant_type: 'authorization_code', code, code_verifier: payload.verifier,
    }),
  });
  if (!result.ok) throw new Error('Cloud token exchange failed');
  const token = await result.json();
  if (typeof token.access_token !== 'string' || !Number.isFinite(token.expires_in) || token.expires_in <= 0 ||
      typeof token.scope !== 'string' || !token.scope.split(' ').includes(scope)) throw new Error('Cloud permission missing');
  const maxAge = Math.min(Math.floor(token.expires_in), 3600);
  const grant = await new EncryptJWT({ access: token.access_token, project: payload.project }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setSubject(account).setAudience(`proving-gemini:${settings.clientId}`)
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAge).encrypt(settings.key);
  jar.set(grantCookie, grant, { ...cookieOptions, maxAge });
}

export async function clearCloudAuthorization() {
  const jar = await cookies();
  jar.delete(grantCookie);
  jar.delete(stateCookie);
}

export async function cloudResponder(account: string) {
  const settings = config();
  const grant = settings && await cloudGrant(account, settings);
  if (!settings || !grant) throw new CloudAiError('Google Cloud를 다시 연결해주세요.', 401, 'cloud_auth_required');
  return async ({ model, messages, instructions, timeoutMs }: {
    model: string; messages: ChatMessage[]; instructions: string; timeoutMs: number;
  }) => {
    if (model !== 'cloud:gemini') throw new CloudAiError('지원하지 않는 모델입니다.', 400, 'cloud_model_invalid');
    const host = settings.location === 'global' ? 'aiplatform.googleapis.com' : `${settings.location}-aiplatform.googleapis.com`;
    const modelPath = `google/models/${settings.gemini}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: instructions }] },
      contents: messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
    };
    const result = await fetch(`https://${host}/v1/projects/${grant.project}/locations/${settings.location}/publishers/${modelPath}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${grant.access}`, 'Content-Type': 'application/json', 'x-goog-user-project': grant.project },
      body: JSON.stringify(body),
    });
    if (result.status === 401) throw new CloudAiError('Google Cloud 연결이 만료되었습니다. 다시 연결해주세요.', 401, 'cloud_auth_required');
    if ([400, 403, 404].includes(result.status)) throw new CloudAiError('Google Cloud의 프로젝트 권한, 결제, 모델 활성화와 리전을 확인해주세요.', result.status, 'cloud_access');
    if (result.status === 429) throw new CloudAiError('Google Cloud 모델의 요청 한도에 도달했습니다.', 429, 'cloud_limit');
    if (!result.ok) throw new CloudAiError('Google Cloud 응답을 받지 못했습니다. 다시 시도해주세요.', 503, 'cloud_unavailable');
    const data = await result.json();
    const parts = data.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text ?? '').join('').trim() : '';
    if (!text || text.length > 200000) throw new CloudAiError('저장할 수 있는 모델 응답이 없습니다.', 502, 'cloud_response');
    return text;
  };
}
