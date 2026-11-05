import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
export type LoginRegistration={client:string;subject:string};
export function isRegistration(value:unknown):value is LoginRegistration{
  if(!value||typeof value!=='object')return false;
  const r=value as Record<string,unknown>;
  return typeof r.client==='string'&&/^oaiapp_[A-Za-z0-9_-]+$/.test(r.client)&&typeof r.subject==='string'&&r.subject.length>0;
}
export async function readRegistration(directory:string,key:string|undefined):Promise<LoginRegistration|null>{
  if(!key||! /^[a-f0-9]{64}$/.test(key))return null;
  try{const value=JSON.parse(await readFile(path.join(directory,`${key}.json`),'utf8'));return isRegistration(value)?value:null;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
}
export async function saveRegistration(directory:string,value:LoginRegistration):Promise<string>{
  if(!isRegistration(value))throw new Error('Invalid registration');
  await mkdir(directory,{recursive:true,mode:0o700});
  const key=randomBytes(32).toString('hex');const file=path.join(directory,`${key}.json`);const temporary=`${file}.tmp`;
  await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});
  await rename(temporary,file);return key;
}
