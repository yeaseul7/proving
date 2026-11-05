import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
export type StudySession = {account:string;name:string;subject:string;client:string;access:string;refresh?:string;expires:number;sessionExpires:number;sessionDeadline?:number;scopes:string[]};
// 사용하지 않으면 7일 뒤 만료되고, 계속 사용해도 로그인 후 30일이 지나면 다시 로그인해야 한다.
export const SESSION_MAX_AGE_SECONDS=7*24*60*60;
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS=30*24*60*60;
export const sessionExpired=(s:StudySession,now=Date.now())=>s.sessionExpires<=now||(s.sessionDeadline!==undefined&&s.sessionDeadline<=now);
const validKey=(key:string)=>/^[A-Za-z0-9_-]{43}$/.test(key);
export async function deleteSession(directory:string,key:string){
  if(!validKey(key))return;
  await unlink(path.join(directory,`${key}.json`)).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
export async function readSession(directory:string,key:string):Promise<StudySession|null>{
  if(!validKey(key))return null;
  try{
    const s=JSON.parse(await readFile(path.join(directory,`${key}.json`),'utf8')) as StudySession;
    if(!s||!['account','name','subject','client','access'].every(k=>typeof (s as unknown as Record<string,unknown>)[k]==='string')||!Number.isFinite(s.expires)||!Number.isFinite(s.sessionExpires)||!Array.isArray(s.scopes)||!s.scopes.every(x=>typeof x==='string')||(s.refresh!==undefined&&typeof s.refresh!=='string')||(s.sessionDeadline!==undefined&&!Number.isFinite(s.sessionDeadline)))return null;
    // 만료된 세션도 반환해 호출자가 refresh token을 폐기한 뒤 지우게 한다.
    return s;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
}
export async function writeSession(directory:string,key:string,session:StudySession){
  if(!validKey(key))throw new Error('Invalid session key');
  await mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,`${key}.json`),temporary=`${file}.${randomBytes(8).toString('hex')}.tmp`;
  try{await writeFile(temporary,JSON.stringify(session),{mode:0o600,flag:'wx'});await rename(temporary,file);}
  finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
