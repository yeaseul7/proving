import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, isStudyNote, markdown, transcript, streak, type StudyNote } from '../lib/study.ts';
const note = (date: string): StudyNote => ({id:date,title:'SQL 공부',date,subject:'DB',content:'## 배운 것\n외래 키',updatedAt:'2026-11-04T00:00:00Z'});
test('연속 공부일은 중복 노트를 한 번만 세고 월 경계를 넘는다',()=>{
 assert.equal(streak([note('2026-11-01'),note('2026-11-01'),note('2026-10-31')],'2026-11-02'),2);
 assert.equal(streak([note('2026-10-31')],'2026-11-02'),0);
 assert.equal(streak([note('2026-11-01'),note('2026-11-02')],'2026-11-02'),2);
});
test('브라우저 저장 기록의 유효성을 확인한다',()=>{
 assert.equal(isStudyNote(note('2026-11-04')),true);
 assert.equal(isStudyNote({...note('2026-02-30')}),false);
 assert.equal(isStudyNote({...note('2026-11-04'),content:null}),false);
 assert.equal(isStudyNote(null),false);
});
test('Markdown에 기록 정보와 원본 내용을 포함한다',()=>{
 assert.equal(dateKey(new Date(2026,10,4)),'2026-11-04');
 const output=markdown(note('2026-11-04'));
 assert.ok(output.startsWith('# SQL 공부\n'));
 assert.ok(output.includes('- 공부 날짜: 2026-11-04'));
 assert.ok(output.includes('## 배운 것\n외래 키'));
 assert.ok(!output.includes('공부 시간'));
});

test('원본 대화를 저장해도 기존 노트를 읽고 순서와 텍스트를 보존한다',()=>{
 const saved:StudyNote={...note('2026-11-04'),messages:[{role:'user',content:'JOIN?\n예제도 알려줘'},{role:'assistant',content:'**LEFT JOIN**\nSELECT * FROM users;'}]};
 assert.equal(isStudyNote(saved),true);
 assert.equal(isStudyNote(note('2026-11-04')),true);
 assert.equal(isStudyNote({...saved,messages:[{role:'system',content:'잘못된 화자'}]}),false);
 const text=transcript(saved);
 assert.ok(text.includes('[나]\nJOIN?\n예제도 알려줘'));
 assert.ok(text.includes('[GPT]\n**LEFT JOIN**\nSELECT * FROM users;'));
 assert.ok(text.indexOf('[나]')<text.indexOf('[GPT]'));
 assert.deepEqual(JSON.parse(JSON.stringify(saved)).messages,saved.messages);
});

test('English exports use English metadata and speaker labels',()=>{
  const note={id:'en',title:'JOINs',date:'2026-11-05',subject:'GPT 공부',content:'## Key concepts\nLEFT JOIN',updatedAt:'2026-11-05',messages:[{role:'user' as const,content:'Explain JOINs'},{role:'assistant' as const,content:'A join combines rows.'}]};
  assert.match(markdown(note,'en'),/Study date:/);
  assert.doesNotMatch(markdown(note,'en'),/공부 날짜|주제|GPT 공부/);
  assert.match(transcript(note,'en'),/\[You\]/);
  assert.doesNotMatch(transcript(note,'en'),/공부 제목|기록 날짜|\[나\]/);
});
