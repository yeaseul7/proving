import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revokeSession } from '../lib/siwc-revocation.ts';
import { upstreamError, errorResponse, recoveryFor } from '../lib/siwc-errors.ts';
import { readResponse } from '../lib/chat.ts';

test('원격 폐기는 discovery endpoint와 회전 토큰을 사용하고 5xx 후 재시도한다',async()=>{
 let posts=0;const delays:number[]=[];
 const fetcher=(async(url:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  if(String(url).includes('openid-configuration'))return Response.json({revocation_endpoint:'https://auth.openai.com/revoke'});
  assert.equal(String(url),'https://auth.openai.com/revoke');
  assert.equal(new URLSearchParams(init?.body as URLSearchParams).get('token_type_hint'),'refresh_token');
  return new Response(null,{status:++posts===1?503:200});
 }) as typeof fetch;
 assert.equal(await revokeSession('test-only','test-client',fetcher,async ms=>{delays.push(ms);}),true);
 assert.equal(posts,2);assert.deepEqual(delays,[250]);
});

test('폐기 네트워크 실패는 3회로 제한하고 4xx와 외부 endpoint는 재시도하지 않는다',async()=>{
 let attempts=0;
 assert.equal(await revokeSession('test','client',(async()=>{attempts++;throw new Error('offline');}) as typeof fetch,async()=>{}),false);
 assert.equal(attempts,3);
 let posts=0;
 const failure=(async(url:Parameters<typeof fetch>[0])=>String(url).includes('openid-configuration')?Response.json({revocation_endpoint:'https://auth.openai.com/revoke'}):(posts++,new Response(null,{status:400}))) as typeof fetch;
 assert.equal(await revokeSession('test','client',failure,async()=>{}),false);assert.equal(posts,1);
 const external=(async()=>Response.json({revocation_endpoint:'https://example.com/revoke'})) as typeof fetch;
 assert.equal(await revokeSession('test','client',external,async()=>{}),false);
});

test('오류 상태·코드·request ID를 보존하고 민감할 수 있는 원문은 제외한다',async()=>{
 const error=await upstreamError(Response.json({error:{code:'subscription_sharing_usage_limit_exceeded',message:'private input',param:'model'}},{status:429,headers:{'x-request-id':'test-request'}}));
 const response=errorResponse(error);const body=await response.json();
 assert.equal(response.status,429);assert.equal(body.code,'subscription_sharing_usage_limit_exceeded');assert.equal(body.requestId,'test-request');assert.equal(body.param,'model');assert.equal(body.recovery,'usage');assert.ok(!JSON.stringify(body).includes('private input'));
 assert.equal(recoveryFor(400,'invalid_grant'),'reauth');assert.equal(recoveryFor(403),'permission');assert.equal(recoveryFor(503),'retry');
});

test('스트림 사용량 오류는 부분 답변을 성공으로 저장하지 않고 429를 유지한다',async()=>{
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"partial"}\n\ndata: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n'));controller.close();}});
 await assert.rejects(()=>readResponse(stream),{status:429,code:'subscription_sharing_usage_limit_exceeded'});
});
