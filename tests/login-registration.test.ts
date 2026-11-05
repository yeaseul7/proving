import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRegistration, saveRegistration } from '../lib/login-registration.ts';
test('등록 클라이언트는 세션 없이 복원되며 인증 토큰은 저장하지 않는다',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'study-registration-'));
 try{
  const value={client:'oaiapp_example',subject:'verified-user'};
  const key=await saveRegistration(dir,value);
  assert.deepEqual(await readRegistration(dir,key),value);
  assert.equal(await readRegistration(dir,'../../private'),null);
  assert.equal(await readRegistration(dir,'0'.repeat(64)),null);
  const file=path.join(dir,`${key}.json`);
  assert.deepEqual(Object.keys(JSON.parse(await readFile(file,'utf8'))).sort(),['client','subject']);
  assert.equal((await stat(file)).mode&0o777,0o600);
 }finally{await rm(dir,{recursive:true,force:true});}
});
