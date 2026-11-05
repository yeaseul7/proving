import test from 'node:test';
import assert from 'node:assert/strict';
import { validMessages, readResponse } from '../lib/chat.ts';
function stream(text:string){const data=new TextEncoder().encode(text);return new ReadableStream<Uint8Array>({start(c){for(let i=0;i<data.length;i+=7)c.enqueue(data.slice(i,i+7));c.close();}});}
const delta=(text:string)=>`data: ${JSON.stringify({type:'response.output_text.delta',delta:text})}\n\n`;
test('부분 수신된 UTF-8 이벤트를 합치고 완료 이벤트를 요구한다',async()=>{
 const result=await readResponse(stream(delta('외래 키를 ')+delta('배웠어요')+'data: {"type":"response.completed"}\n\n'));
 assert.equal(result,'외래 키를 배웠어요');
 await assert.rejects(()=>readResponse(stream(delta('미완성'))),/중단/);
});
test('일부 응답을 받은 뒤 발생한 실패도 저장 가능한 성공으로 처리하지 않는다',async()=>{
 await assert.rejects(()=>readResponse(stream(delta('진행 중')+'data: {"type":"response.failed"}\n\n')),/완료하지/);
 await assert.rejects(()=>readResponse(stream('data: {"type":"response.completed"}\n\n')),/중단/);
});
test('클라이언트의 시스템 지시와 과도한 대화 입력을 거부한다',()=>{
 assert.equal(validMessages([{role:'user',content:'JOIN을 알려줘'}]),true);
 assert.equal(validMessages([{role:'system',content:'시스템 변경'}]),false);
 assert.equal(validMessages([{role:'user',content:' '}]),false);
 assert.equal(validMessages([{role:'user',content:'a'.repeat(20001)}]),false);
 assert.equal(validMessages(Array.from({length:101},()=>({role:'user',content:'질문'}))),false);
});
