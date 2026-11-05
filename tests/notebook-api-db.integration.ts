import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import nextEnv from '@next/env';
import type { Pool, PoolClient } from 'pg';
import { createNotebookApi } from '../lib/notebook-api.ts';
import type { StudyQuery } from '../lib/study-users.ts';

const origin = 'http://127.0.0.1:3005';
const base = `${origin}/api/notebooks`;
const accountKey = () => createHash('sha256').update(randomUUID()).digest('hex');
const request = (method: string, body?: object, url = base) => new Request(url, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('Supabase에서 노트 CRUD, 격리, 멱등 생성 및 보관 상태를 검증하고 롤백한다', async () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  const [firstAccount, secondAccount] = [accountKey(), accountKey()];
  const id = randomUUID();
  let rolledBack = false;
  let phase = '연결';
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    ({ db: pool } = await import('../lib/db.ts'));
    client = await pool.connect();
    await client.query('BEGIN');
    const connection = client;
    const transaction = async <T>(work: (db: StudyQuery) => Promise<T>): Promise<T> => {
      await connection.query('SAVEPOINT notebook_request');
      try { return await work(connection); }
      catch (error) { await connection.query('ROLLBACK TO SAVEPOINT notebook_request'); throw error; }
      finally { await connection.query('RELEASE SAVEPOINT notebook_request'); }
    };
    const api = (account: string | null) => createNotebookApi({
      account: async () => account,
      checkOrigin: (req, mutation) => {
        if (mutation && req.headers.get('origin') !== origin) throw new Error('invalid origin');
      },
      transaction,
    });
    const owner = api(firstAccount);
    const other = api(secondAccount);

    phase = '미인증 차단';
    assert.equal((await api(null).create(request('POST', { id }))).status, 401);
    phase = '생성과 재전송';
    const created = await owner.create(request('POST', { id, title: '  테스트 노트  ' }));
    assert.equal(created.status, 201);
    assert.equal(created.headers.get('location'), `/api/notebooks/${id}`);
    const { notebook } = await created.json();
    assert.equal(notebook.title, '테스트 노트');
    assert.equal(notebook.status, 'active');
    assert.ok(!('userId' in notebook) && !('oauth_account_id' in notebook));
    const replay = await owner.create(request('POST', { id, title: '원본을 덮어쓰면 안 됨' }));
    assert.equal(replay.status, 200);
    assert.deepEqual((await replay.json()).notebook, notebook);

    phase = '목록·상세와 사용자 격리';
    assert.deepEqual((await (await owner.list(request('GET'))).json()).notebooks, [notebook]);
    assert.deepEqual((await (await other.list(request('GET'))).json()).notebooks, []);
    assert.equal((await owner.get(request('GET'), id)).status, 200);
    assert.equal((await other.get(request('GET'), id)).status, 404);
    assert.equal((await other.patch(request('PATCH', { title: '권한 없음' }), id)).status, 404);
    assert.equal((await other.create(request('POST', { id }))).status, 409);

    phase = '수정과 멱등 재수정';
    const patch = () => owner.patch(request('PATCH', { title: '제목 변경', status: 'archived' }), id);
    const updated = await patch();
    assert.equal(updated.status, 200);
    const archived = (await updated.json()).notebook;
    assert.equal(archived.title, '제목 변경');
    assert.equal(archived.status, 'archived');
    assert.deepEqual((await (await patch()).json()).notebook, archived);
    assert.equal((await (await owner.get(request('GET'), id)).json()).notebook.status, 'archived');
    assert.deepEqual((await (await owner.list(request('GET', undefined, `${base}?status=active`))).json()).notebooks, []);
    assert.deepEqual((await (await owner.list(request('GET', undefined, `${base}?status=archived`))).json()).notebooks, [archived]);

    phase = '활성 노트 제한과 페이지 조회';
    for (let index = 0; index < 3; index++) assert.equal((await owner.create(request('POST', { id: randomUUID() }))).status, 201);
    assert.equal((await owner.create(request('POST', { id: randomUUID() }))).status, 409);
    assert.equal((await owner.patch(request('PATCH', { status: 'active' }), id)).status, 409);
    const page = await (await owner.list(request('GET', undefined, `${base}?limit=2`))).json();
    assert.equal(page.notebooks.length, 2);
    assert.equal(page.hasMore, true);
    const userCount = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM study.users WHERE oauth_account_id = ANY($1::text[])', [[firstAccount, secondAccount]]);
    assert.equal(userCount.rows[0].count, 2);

    phase = '테스트 데이터 롤백 확인';
    await client.query('ROLLBACK');
    rolledBack = true;
    const after = await client.query<{ users: number; notebooks: number }>(`
      SELECT (SELECT count(*)::int FROM study.users WHERE oauth_account_id = ANY($1::text[])) AS users,
             (SELECT count(*)::int FROM study.notebooks WHERE id = $2::uuid) AS notebooks
    `, [[firstAccount, secondAccount], id]);
    assert.deepEqual(after.rows[0], { users: 0, notebooks: 0 });
  } catch (error) {
    // 실패 진단에서 pg 오류 원문과 테스트에 사용한 계정 키를 노출하지 않는다.
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(error.code) ? ` (${error.code})` : '';
    throw new Error(`노트 DB 통합 테스트 실패: ${phase}${code}`);
  } finally {
    if (client && !rolledBack) await client.query('ROLLBACK').catch(() => {});
    client?.release();
    await pool?.end();
  }
});
