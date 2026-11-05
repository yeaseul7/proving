import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRuntimeMode } from '../lib/runtime-mode.ts';

const hosted = {
  AUTH_PROVIDER: 'supabase', NEXT_PUBLIC_SITE_URL: 'https://proving.example.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://ref.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
};

test('기본값은 로컬 ChatGPT 로그인·플랜·DB 저장이다', () => {
  assert.deepEqual(resolveRuntimeMode({}), { auth: 'siwc', ai: 'chatgpt-plan', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3005' }), { auth: 'siwc', ai: 'chatgpt-plan', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ STUDY_STORE: 'remote', PROVING_SYNC_URL: 'https://proving.example.com' }), { auth: 'siwc', ai: 'chatgpt-plan', store: 'remote' });
});

test('공개 주소에서는 ChatGPT 플랜 사용을 켜지 않는다', () => {
  assert.throws(() => resolveRuntimeMode({ NEXT_PUBLIC_SITE_URL: 'https://proving.example.com' }), /loopback/);
  assert.throws(() => resolveRuntimeMode({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1.example.com' }), /loopback/);
  assert.throws(() => resolveRuntimeMode({ AI_PROVIDER: 'openai-key' }), /AI_PROVIDER/);
  assert.throws(() => resolveRuntimeMode({ STUDY_STORE: 'remote' }), /PROVING_SYNC_URL/);
  assert.throws(() => resolveRuntimeMode({ STUDY_STORE: 'remote', PROVING_SYNC_URL: 'http://proving.example.com' }), /PROVING_SYNC_URL/);
});

test('배포 사이트는 Google 로그인·AI 없음·DB 저장만 허용하고 https 주소와 Supabase 설정이 필요하다', () => {
  assert.deepEqual(resolveRuntimeMode(hosted), { auth: 'supabase', ai: 'none', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ ...hosted, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }), { auth: 'supabase', ai: 'none', store: 'db' });
  assert.throws(() => resolveRuntimeMode({ ...hosted, AI_PROVIDER: 'chatgpt-plan' }), /AI_PROVIDER/);
  assert.throws(() => resolveRuntimeMode({ ...hosted, STUDY_STORE: 'remote' }), /own database/);
  assert.throws(() => resolveRuntimeMode({ ...hosted, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3005' }), /https/);
  assert.throws(() => resolveRuntimeMode({ ...hosted, NEXT_PUBLIC_SUPABASE_URL: '' }), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(() => resolveRuntimeMode({ AUTH_PROVIDER: 'github' }), /AUTH_PROVIDER/);
});
