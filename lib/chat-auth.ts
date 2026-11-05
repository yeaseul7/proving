import { SiwcError, upstreamError } from './siwc-errors.ts';
import { revokeSession } from './siwc-revocation.ts';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { readRegistration, saveRegistration } from './login-registration.ts';
import { readSession, writeSession, deleteSession, sessionExpired, SESSION_MAX_AGE_SECONDS, SESSION_ABSOLUTE_MAX_AGE_SECONDS, type StudySession } from './session-store.ts';
export { SESSION_MAX_AGE_SECONDS } from './session-store.ts';
import { cookies } from 'next/headers';
import { after } from 'next/server';

const ISSUER = 'https://auth.openai.com';
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
export const REGISTRATION_COOKIE = 'study-registration';
const registrationDirectory=path.join(process.cwd(),'.local','registrations');
export const COOKIE = 'study-session';
const sessionDirectory=path.join(process.cwd(),'.local','sessions');
export const TRANSACTION_COOKIE = 'study-login';
export const random = () => randomBytes(32).toString('base64url');
type Transaction = {state: string; nonce: string; verifier: string; redirect: string; client?: string; subject?: string; expires: number};
type Session = StudySession;
const globalAuth = globalThis as typeof globalThis & { studyAuth?: { pending: Map<string, Transaction>; sessions: Map<string, Session>; refreshes: Map<string, Promise<void>>; host?: Promise<string> } };
const state: NonNullable<typeof globalAuth.studyAuth> = globalAuth.studyAuth ??= {pending:new Map(), sessions:new Map(), refreshes:new Map()};
const signingOut = new Set<string>();
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
// 교체되거나 만료된 세션의 refresh token이 OpenAI에 유효한 채로 남지 않게 응답 후 폐기한다.
async function discardSession(id:string,session:Session|null|undefined){
  state.sessions.delete(id);await deleteSession(sessionDirectory,id);
  if(session?.refresh)after(()=>revokeSession(session.refresh,session.client).catch(()=>false));
}
export function localOrigin(request: Request) {
  const host=request.headers.get('host')??new URL(request.url).host;
  if(!/^127\.0\.0\.1(?::\d{1,5})?$/.test(host))throw new Error('이 로그인 방식은 127.0.0.1에서 실행하는 로컬 버전용입니다.');
  return `http://${host}`;
}
export function assertLocal(request: Request, mutation = false) {
  const origin=localOrigin(request);
  if (mutation && request.headers.get('origin') !== origin) throw new SiwcError(403,'invalid_origin');
}
async function hostId() {
  return state.host ??= (async()=>{
    const directory = path.join(process.cwd(),'.local');
    await mkdir(directory,{recursive:true,mode:0o700});
    const file = path.join(directory,'host-id');
    try {return (await readFile(file,'utf8')).trim();}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const id=`urn:uuid:${crypto.randomUUID()}`;
    try{await writeFile(file,id,{mode:0o600,flag:'wx'});return id;}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')return (await readFile(file,'utf8')).trim();throw error;}
  })();
}
export async function startLogin(request: Request) {
  assertLocal(request);
  for (const [key,value] of state.pending) if(value.expires<Date.now())state.pending.delete(key);
  if(state.pending.size>=100)throw new Error('로그인 요청이 많습니다. 잠시 후 다시 시도해주세요.');
  const previous=await getSession()??await readRegistration(registrationDirectory,(await cookies()).get(REGISTRATION_COOKIE)?.value);
  const id=random();
  const transaction:Transaction={client:previous?.client,subject:previous?.subject,state:random(),nonce:random(),verifier:random(),redirect:`${localOrigin(request)}/auth/callback`,expires:Date.now()+10*60_000};
  state.pending.set(id,transaction);
  const url=new URL(`${ISSUER}/api/accounts/authorize`);
  url.search=new URLSearchParams({client_id:previous?.client??'dynamic_agent_client',...(previous?{}:{agent_name_hint:'proving'}),...(new URL(request.url).searchParams.get('reauthorize')==='1'?{prompt:'consent'}:{}),ext_agent_host_id:await hostId(),response_type:'code',redirect_uri:transaction.redirect,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:'https://api.openai.com/v1',state:transaction.state,nonce:transaction.nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(transaction.verifier).digest('base64url')}).toString();
  return {id,url};
}
export async function finishLogin(request: Request) {
  assertLocal(request);
  const jar=await cookies();const id=jar.get(TRANSACTION_COOKIE)?.value;
  const pending=id?state.pending.get(id):undefined;
  if(id)state.pending.delete(id);
  const query=new URL(request.url).searchParams;
  if(!pending||pending.expires<Date.now()||query.get('state')!==pending.state)throw new Error('로그인 요청이 만료되었거나 일치하지 않습니다. 다시 로그인해주세요.');
  if(query.has('error'))throw new Error('로그인이 취소되었거나 사용 권한이 승인되지 않았습니다.');
  const client=query.get('client_id')??pending.client,code=query.get('code');
  if(pending.client&&client!==pending.client)throw new Error('등록된 클라이언트와 일치하지 않습니다.');
  if(!client?.startsWith('oaiapp_')||!code)throw new Error('로그인 등록이 완료되지 않았습니다.');
  const response=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,code,code_verifier:pending.verifier,redirect_uri:pending.redirect,resource:'https://api.openai.com/v1'}),signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error('로그인 인증을 완료하지 못했습니다. 다시 시도해주세요.');
  const token=await response.json();
  const {payload}=await jwtVerify(token.id_token,jwks,{issuer:ISSUER,audience:client,requiredClaims:['sub','exp','iat'],clockTolerance:5});
  if(payload.nonce!==pending.nonce||!payload.sub||(pending.subject&&payload.sub!==pending.subject))throw new Error('로그인 정보를 검증하지 못했습니다.');
  if(typeof token.access_token!=='string'||typeof token.expires_in!=='number')throw new Error('인증 토큰을 받지 못했습니다.');
  const sessionId=random();
  const session:Session={account:createHash('sha256').update(`${ISSUER}:${payload.sub}`).digest('hex'),name:typeof payload.name==='string'?payload.name:'내 계정',subject:payload.sub,client,access:token.access_token,refresh:token.refresh_token,expires:Date.now()+token.expires_in*1000,sessionExpires:Date.now()+SESSION_MAX_AGE_SECONDS*1000,sessionDeadline:Date.now()+SESSION_ABSOLUTE_MAX_AGE_SECONDS*1000,scopes:typeof token.scope==='string'?token.scope.split(' '):[]};
  const registration=await saveRegistration(registrationDirectory,{client,subject:payload.sub});
  await writeSession(sessionDirectory,sessionId,session);
  state.sessions.set(sessionId,session);
  const old=jar.get(COOKIE)?.value;if(old&&old!==sessionId)await discardSession(old,state.sessions.get(old)??await readSession(sessionDirectory,old));
  return {sessionId,registration};
}
export async function getSession() {
  const jar=await cookies();const id=jar.get(COOKIE)?.value;
  if(!id||signingOut.has(id))return null;
  let session=state.sessions.get(id);
  if(!session){session=(await readSession(sessionDirectory,id))??undefined;if(session)state.sessions.set(id,session);}
  if(signingOut.has(id))return null;
  if(!session||sessionExpired(session)){await discardSession(id,session);return null;}
  // Renew on actual authenticated requests, rather than a background timer, but never past the login deadline.
  // 상한이 없던 기존 세션은 현재 만료 시각을 상한으로 삼아 더 연장하지 않는다.
  session.sessionDeadline??=session.sessionExpires;
  session.sessionExpires=Math.min(Date.now()+SESSION_MAX_AGE_SECONDS*1000,session.sessionDeadline);
  await writeSession(sessionDirectory,id,session);
  jar.set(COOKIE,id,{httpOnly:true,sameSite:'lax',path:'/',maxAge:Math.ceil((session.sessionExpires-Date.now())/1000)});
  return session;
}
export async function authorizedSession() {
  const sessionId=(await cookies()).get(COOKIE)?.value;
  const session=await getSession();
  if(!session)throw new SiwcError(401,'session_expired');
  if(!session.scopes.includes('chatgpt.tokens.use.direct'))throw new SiwcError(403,'direct_scope_missing');
  if(session.expires<Date.now()+60_000){
    let refresh=state.refreshes.get(sessionId!);
    if(!refresh){refresh=(async()=>{
      if(!session.refresh)throw new SiwcError(401,'invalid_grant');
      const response=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:session.client,refresh_token:session.refresh,resource:'https://api.openai.com/v1'}),signal:AbortSignal.timeout(20_000)});
      if(!response.ok)throw await upstreamError(response);
      const token=await response.json();
      if(typeof token.access_token!=='string'||typeof token.expires_in!=='number')throw new Error('로그인 갱신 응답이 올바르지 않습니다.');
      session.access=token.access_token;session.refresh=token.refresh_token??session.refresh;session.expires=Date.now()+token.expires_in*1000;
      if(typeof token.scope==='string')session.scopes=token.scope.split(' ');
      if(state.sessions.get(sessionId!)!==session)throw new SiwcError(401,'session_expired');
      await writeSession(sessionDirectory,sessionId!,session);
    })();state.refreshes.set(sessionId!,refresh);}
    try{await refresh;}finally{state.refreshes.delete(sessionId!);}
  }
  if(state.sessions.get(sessionId!)!==session)throw new SiwcError(401,'session_expired');
  if(!session.scopes.includes('chatgpt.tokens.use.direct'))throw new SiwcError(403,'direct_scope_missing');
  return session;
}
export async function logout() {
  const id=(await cookies()).get(COOKIE)?.value;
  if(!id)return {revocationConfirmed:true};
  signingOut.add(id);
  const session=state.sessions.get(id)??await readSession(sessionDirectory,id);
  // 갱신 완료를 기다린 뒤 최신 회전 토큰을 폐기한다. 새 요청은 세션 제거로 차단한다.
  const refreshing=state.refreshes.get(id);
  state.sessions.delete(id);
  await deleteSession(sessionDirectory,id);
  if(refreshing)await refreshing.catch(()=>{});
  let revocationConfirmed=false;
  try{revocationConfirmed=session?await revokeSession(session.refresh,session.client):false;}
  finally{await deleteSession(sessionDirectory,id);}
  return {revocationConfirmed};
}
