import test from 'node:test';
import assert from 'node:assert/strict';
import { browserRoute, isValidKey } from '../lib/browser-ai.ts';
import { cleanTitle, studyInstructions } from '../lib/prompts.ts';
import { apiMessages, keepProviders } from '../lib/chat.ts';

test('공급자 접두사가 붙은 모델만 브라우저 직접 호출로 보낸다',()=>{
 assert.deepEqual(browserRoute('anthropic:claude-opus-5-5'),{provider:'anthropic',model:'claude-opus-5-5'});
 assert.deepEqual(browserRoute('gemini:gemini-2.5-pro'),{provider:'gemini',model:'gemini-2.5-pro'});
 assert.equal(browserRoute('gpt-5'),null);
 assert.deepEqual(browserRoute('openai:gpt-5'),{provider:'openai',model:'gpt-5'});
 assert.equal(browserRoute('azure:gpt-5'),null);
 assert.equal(browserRoute('anthropic:'),null);
});

test('공백이나 제어 문자가 섞인 키는 저장하지 않는다',()=>{
 assert.equal(isValidKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz'),true);
 assert.equal(isValidKey('short'),false);
 assert.equal(isValidKey('sk-ant-api03 abcdefghijklmnopqrstuvwxyz'),false);
 assert.equal(isValidKey(undefined),false);
});

test('서버와 브라우저가 같은 지시문과 제목 정리를 쓴다',()=>{
 assert.match(studyInstructions('en',false),/^Write all replies and study notes in English\./);
 assert.match(studyInstructions('ko',true),/학습 노트로 정리한다/);
 assert.equal(cleanTitle('"# 외래 키 정리"\n'),'외래 키 정리');
});

test('답변 공급자는 API로 보내지 않고 서버 노트와 합칠 때 유지한다',()=>{
 const cached=[{role:'user' as const,content:'조인'},{role:'assistant' as const,content:'설명',provider:'anthropic' as const}];
 assert.deepEqual(apiMessages(cached),[{role:'user',content:'조인'},{role:'assistant',content:'설명'}]);
 assert.equal(keepProviders([{role:'user',content:'조인'},{role:'assistant',content:'설명'}],cached)[1].provider,'anthropic');
 assert.equal(keepProviders([{role:'user',content:'조인'},{role:'assistant',content:'다른 답'}],cached)[1].provider,undefined);
});
