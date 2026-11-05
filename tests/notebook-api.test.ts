import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createNotebookApi } from '../lib/notebook-api.ts';
import { studyAccountFromSession } from '../lib/study-users.ts';

const base = 'http://127.0.0.1:3005/api/notebooks';
const id = randomUUID();
const origin = new URL(base).origin;
const request = (method: string, body?: unknown, url = base) => new Request(url, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
function api(account: string | null, rejectOrigin = false) {
  return createNotebookApi({
    account: async () => account,
    checkOrigin: () => { if (rejectOrigin) throw new Error('invalid origin'); },
    transaction: async () => assert.fail('검증 실패 요청이 DB에 접근했습니다.'),
  });
}

test('서버 세션에서 검증된 계정 키만 추출한다', () => {
  const subject = 'synthetic-study-subject';
  const account = createHash('sha256').update(`https://auth.openai.com:${subject}`).digest('hex');
  assert.ok(studyAccountFromSession({ subject, account }) === account);
  assert.equal(studyAccountFromSession({ subject: '', account }), null);
  assert.equal(studyAccountFromSession({ subject: 'different-subject', account }), null);
  assert.equal(studyAccountFromSession(null), null);
});

test('미인증 또는 계정 키 누락 시 모든 노트 요청을 401로 거부한다', async () => {
  for (const account of [null, '', 'invalid']) {
    const handlers = api(account);
    for (const response of await Promise.all([
      handlers.list(request('GET')),
      handlers.get(request('GET'), id),
      handlers.create(request('POST', { id })),
      handlers.patch(request('PATCH', { title: '변경' }), id),
    ])) {
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('잘못된 UUID, 입력 필드, 제목, 상태, 페이지 범위를 DB 접근 전에 차단한다', async () => {
  const handlers = api('a'.repeat(64));
  for (const response of await Promise.all([
    handlers.create(request('POST', { title: 'UUID 누락' })),
    handlers.create(request('POST', { id, userId: id })),
    handlers.create(request('POST', { id, title: ' ' })),
    handlers.create(request('POST', { id, title: '가'.repeat(101) })),
    handlers.get(request('GET'), 'invalid-uuid'),
    handlers.patch(request('PATCH', { status: 'deleted' }), id),
    handlers.patch(request('PATCH', {}), id),
    handlers.patch(request('PATCH', { draft: '허용되지 않는 필드' }), id),
    handlers.list(request('GET', undefined, `${base}?limit=101`)),
    handlers.list(request('GET', undefined, `${base}?status=active&status=archived`)),
  ])) assert.equal(response.status, 400);
});

test('변경 요청에서 출처와 JSON 형식 및 크기를 검사한다', async () => {
  const account = 'a'.repeat(64);
  assert.equal((await api(account, true).create(request('POST', { id }))).status, 403);
  assert.equal((await api(account).create(new Request(base, { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await api(account).create(request('POST', { id, title: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await api(account).create(new Request(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  }))).status, 400);
});
