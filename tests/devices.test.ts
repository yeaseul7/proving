import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDeviceName, formatLinkCode, newLinkCode, normalizeLinkCode } from '../lib/devices.ts';
import { checkSiteRequest, emailAllowed } from '../lib/auth/supabase-checks.ts';

test('연결 코드는 헷갈리는 문자 없이 12자리이고 입력 형식 차이를 허용한다', () => {
  const codes = new Set(Array.from({ length: 200 }, newLinkCode));
  assert.equal(codes.size, 200);
  for (const code of codes) assert.match(code, /^[A-HJKMNP-Z2-9]{12}$/);
  assert.equal(formatLinkCode('ABCDEFGHJKMN'), 'ABCD-EFGH-JKMN');
  assert.equal(normalizeLinkCode(' abcd-efgh jkmn '), 'ABCDEFGHJKMN');
  assert.equal(normalizeLinkCode(42), '');
});

test('기기 이름은 공백을 정리하고 60자까지 허용한다', () => {
  assert.equal(cleanDeviceName('  예슬의   MacBook '), '예슬의 MacBook');
  assert.equal(cleanDeviceName(''), null);
  assert.equal(cleanDeviceName('가'.repeat(61)), null);
  assert.equal(cleanDeviceName(null), null);
});

test('배포 사이트는 자기 도메인의 요청만 받고 변경 요청에는 같은 Origin이 필요하다', () => {
  const site = new URL('https://proving.example.com');
  const request = (host: string, origin?: string) => new Request('https://proving.example.com/api/x', { headers: { host, ...(origin ? { origin } : {}) } });
  assert.doesNotThrow(() => checkSiteRequest(request('proving.example.com'), false, site));
  assert.doesNotThrow(() => checkSiteRequest(request('proving.example.com', 'https://proving.example.com'), true, site));
  assert.throws(() => checkSiteRequest(request('evil.example.com'), false, site));
  assert.throws(() => checkSiteRequest(request('proving.example.com', 'https://evil.example.com'), true, site));
  assert.throws(() => checkSiteRequest(request('proving.example.com'), true, site));
});

test('가입 허용 목록이 있으면 목록의 이메일만 로그인한다', () => {
  assert.equal(emailAllowed('a@x.com', ''), true);
  assert.equal(emailAllowed(undefined, ''), true);
  assert.equal(emailAllowed('A@X.com', 'a@x.com, b@x.com'), true);
  assert.equal(emailAllowed('c@x.com', 'a@x.com,b@x.com'), false);
  assert.equal(emailAllowed(undefined, 'a@x.com'), false);
});
