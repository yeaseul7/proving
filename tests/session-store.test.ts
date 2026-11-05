import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readSession, writeSession, deleteSession, sessionExpired, SESSION_MAX_AGE_SECONDS } from '../lib/session-store.ts';
test('session survives a fresh disk read, renewal, and logout',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'study-session-'));const key='a'.repeat(43);
  const session={account:'test',name:'name',subject:'sub',client:'oaiapp_test',access:'test-access',refresh:'test-refresh',expires:Date.now()+60000,sessionExpires:Date.now()+SESSION_MAX_AGE_SECONDS*1000,scopes:['chatgpt.tokens.use.direct']};
  try{
    await writeSession(dir,key,session);
    assert.deepEqual(await readSession(dir,key),session);
    assert.equal((await stat(path.join(dir,`${key}.json`))).mode&0o777,0o600);
    session.sessionExpires+=1000;session.refresh='rotated';await writeSession(dir,key,session);
    assert.deepEqual(await readSession(dir,key),session);
    await deleteSession(dir,key);assert.equal(await readSession(dir,key),null);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('expired sessions stay readable for revocation and path traversal is rejected',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'study-session-'));const key='b'.repeat(43);
  try{
    await writeSession(dir,key,{account:'test',name:'name',subject:'sub',client:'oaiapp_test',access:'access',refresh:'old-refresh',expires:Date.now(),sessionExpires:Date.now()-1,scopes:[]});
    const expired=await readSession(dir,key);
    assert.equal(expired?.refresh,'old-refresh');assert.equal(sessionExpired(expired!),true);
    assert.equal(await readSession(dir,'../secret'),null);
    await assert.rejects(writeSession(dir,'../secret',{} as never));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('the login deadline expires a session even while it is still being used',()=>{
  const now=Date.now();
  const session={account:'test',name:'name',subject:'sub',client:'oaiapp_test',access:'access',expires:now,sessionExpires:now+60000,sessionDeadline:now-1,scopes:[]};
  assert.equal(sessionExpired(session,now),true);
  assert.equal(sessionExpired({...session,sessionDeadline:now+60000},now),false);
  assert.equal(sessionExpired({...session,sessionDeadline:undefined},now),false);
});
