import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRuntimeMode } from '../lib/runtime-mode.ts';

const hosted = {
  AUTH_PROVIDER: 'supabase', NEXT_PUBLIC_SITE_URL: 'https://proving.example.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://ref.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
};

const supabaseKeys = { NEXT_PUBLIC_SUPABASE_URL: 'https://ref.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' };

test('기본값은 공개 읽기 전용이며 로컬 주소에서도 켜진다', () => {
  assert.deepEqual(resolveRuntimeMode(supabaseKeys), { auth: 'supabase', ai: 'none', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ ...supabaseKeys, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3005' }), { auth: 'supabase', ai: 'none', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({}), { auth: 'supabase', ai: 'none', store: 'db' });
});

test('ChatGPT 로그인은 명시적으로 켜고 루프백 주소에서만 동작한다', () => {
  const siwc = { AUTH_PROVIDER: 'siwc' };
  assert.deepEqual(resolveRuntimeMode(siwc), { auth: 'siwc', ai: 'chatgpt-plan', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ ...siwc, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3005' }), { auth: 'siwc', ai: 'chatgpt-plan', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ ...siwc, STUDY_STORE: 'remote', PROVING_SYNC_URL: 'https://proving.example.com' }), { auth: 'siwc', ai: 'chatgpt-plan', store: 'remote' });
  assert.throws(() => resolveRuntimeMode({ ...siwc, NEXT_PUBLIC_SITE_URL: 'https://proving.example.com' }), /loopback/);
  assert.throws(() => resolveRuntimeMode({ ...siwc, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1.example.com' }), /loopback/);
  assert.throws(() => resolveRuntimeMode({ ...siwc, AI_PROVIDER: 'openai-key' }), /AI_PROVIDER/);
  assert.throws(() => resolveRuntimeMode({ ...siwc, STUDY_STORE: 'remote' }), /PROVING_SYNC_URL/);
  assert.throws(() => resolveRuntimeMode({ ...siwc, STUDY_STORE: 'remote', PROVING_SYNC_URL: 'http://proving.example.com' }), /PROVING_SYNC_URL/);
});

test('배포 사이트는 공개 읽기 전용이며 DB 저장과 HTTPS를 사용한다', () => {
  assert.deepEqual(resolveRuntimeMode(hosted), { auth: 'supabase', ai: 'none', store: 'db' });
  assert.deepEqual(resolveRuntimeMode({ ...hosted, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }), { auth: 'supabase', ai: 'none', store: 'db' });
  assert.throws(() => resolveRuntimeMode({ ...hosted, AI_PROVIDER: 'chatgpt-plan' }), /AI_PROVIDER/);
  assert.throws(() => resolveRuntimeMode({ ...hosted, STUDY_STORE: 'remote' }), /own database/);
  assert.throws(() => resolveRuntimeMode({ ...hosted, NEXT_PUBLIC_SITE_URL: 'http://proving.example.com' }), /https/);
  assert.deepEqual(resolveRuntimeMode({ ...hosted, NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3016' }), { auth: 'supabase', ai: 'none', store: 'db' });
  assert.throws(() => resolveRuntimeMode({ AUTH_PROVIDER: 'github' }), /AUTH_PROVIDER/);
});
