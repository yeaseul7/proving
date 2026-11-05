import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRuntimeMode } from '../lib/runtime-mode.ts';

test('기본값은 로컬 ChatGPT 로그인·플랜·DB 저장이다', () => {
  assert.deepEqual(resolveRuntimeMode({}), { auth: 'siwc', ai: 'chatgpt-plan', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3005' }), { auth: 'siwc', ai: 'chatgpt-plan', store: 'db' });
});

test('공개 주소에서는 ChatGPT 플랜 사용을 켜지 않고 아직 없는 공급자는 거부한다', () => {
  assert.throws(() => resolveRuntimeMode({ NEXT_PUBLIC_SITE_URL: 'https://proving.example.com' }), /loopback/);
  assert.throws(() => resolveRuntimeMode({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1.example.com' }), /loopback/);
  assert.throws(() => resolveRuntimeMode({ AUTH_PROVIDER: 'supabase' }), /AUTH_PROVIDER/);
  assert.throws(() => resolveRuntimeMode({ AI_PROVIDER: 'openai-key' }), /AI_PROVIDER/);
  assert.throws(() => resolveRuntimeMode({ STUDY_STORE: 'remote' }), /STUDY_STORE/);
});
