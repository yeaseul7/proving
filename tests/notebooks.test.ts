import test from 'node:test';
import assert from 'node:assert/strict';
import { addNotebook, readWorkspace, summaryMessages, type Notebook } from '../lib/notebooks.ts';
const note=(id:string):Notebook=>({id,title:`노트 ${id}`,date:'2026-11-04',messages:[],draft:`질문 ${id}`});
test('노트는 세 개까지만 추가할 수 있고 기존 노트와 초안을 유지한다',()=>{
 let w={activeId:'a',notebooks:[note('a')]};
 w=addNotebook(w,note('b'));w=addNotebook(w,note('c'));
 assert.equal(w.activeId,'c');assert.equal(w.notebooks[0].draft,'질문 a');
 assert.throws(()=>addNotebook(w,note('d')),/최대 3개/);
});
test('기존 단일 대화 원본을 유지하면서 첫 노트로 이전한다',()=>{
 const messages=[{role:'user',content:'외래 키란?'}];
 const w=readWorkspace({id:'legacy',date:'2026-11-04',messages,summary:'배운 내용',recorded:true});
 assert.equal(w.activeId,'legacy');assert.equal(w.notebooks[0].title,'제목 없는 노트');assert.deepEqual(w.notebooks[0].messages,messages);
});
test('저장된 선택 노트와 제목을 복원하고 잘못된 목록을 거부한다',()=>{
 const w={activeId:'b',notebooks:[note('a'),note('b')]};
 assert.deepEqual(readWorkspace(JSON.parse(JSON.stringify(w))),w);
 assert.equal(readWorkspace({...w,activeId:'missing'}).activeId,'a');
 assert.throws(()=>readWorkspace({activeId:'a',notebooks:[note('a'),note('a')]}));
 assert.throws(()=>readWorkspace({activeId:'a',notebooks:[]}));
 assert.throws(()=>readWorkspace({activeId:'a',notebooks:['a','b','c','d'].map(note)}));
});
test('이어하기한 노트는 이전 기록을 맥락으로 주고 새 대화만 요약한다',()=>{
 const old=[{role:'user' as const,content:'외래 키란?'},{role:'assistant' as const,content:'참조 무결성 설명'}];
 const added=[{role:'user' as const,content:'복합 키는?'},{role:'assistant' as const,content:'여러 컬럼 키 설명'}];
 const resumed:Notebook={...note('r'),messages:[...old,...added],resumed:{count:2,summary:'## 핵심 개념\n외래 키'}};
 const input=summaryMessages(resumed);
 assert.equal(input.length,3);assert.match(input[0].content,/이미 기록한/);assert.match(input[0].content,/외래 키/);
 assert.deepEqual(input.slice(1),added);
 assert.deepEqual(summaryMessages({...note('n'),messages:old}),old);
 assert.throws(()=>summaryMessages({...resumed,messages:old}),/이어서 나눈 대화가 없어/);
 assert.equal(readWorkspace(JSON.parse(JSON.stringify({activeId:'r',notebooks:[resumed]}))).notebooks[0].resumed?.count,2);
 assert.throws(()=>readWorkspace({activeId:'r',notebooks:[{...resumed,resumed:{count:9,summary:'x'}}]}));
});
