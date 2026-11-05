import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import nextEnv from '@next/env';
import type { Pool, PoolClient } from 'pg';
import { applyStudyChange, loadWorkspace } from '../lib/study-sync.ts';
import { findOrCreateStudyUser } from '../lib/study-users.ts';
import { transcript } from '../lib/study.ts';

test('실제 DB에서 대화 복원, 기록, 원본 삭제를 검증하고 롤백한다', async () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  let step = '연결';
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    ({ db: pool } = await import('../lib/db.ts'));
    client = await pool.connect();
    await client.query('BEGIN');
    const user = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'));
    const other = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'));
    const notebook = {
      id: randomUUID(), date: '2026-11-05', title: '테스트',
      messages: [{ role: 'user' as const, content: '질문' }, { role: 'assistant' as const, content: '긴 답변 '.repeat(7000) }],
      draft: '초안', summary: '공부 요약',
    };
    step = '진행 중 저장 및 조회';
    await applyStudyChange(client, user, { action: 'save', notebook });
    await applyStudyChange(client, user, { action: 'save', notebook });
    const active = (await loadWorkspace(client, user)).notebooks;
    assert.deepEqual(active[0].messages, notebook.messages);
    assert.equal(active[0].draft, '초안');
    assert.equal((await loadWorkspace(client, other)).notebooks.length, 0);
    for (let i = 0; i < 2; i++) {
      await applyStudyChange(client, user, { action: 'save', notebook: {...notebook, id: randomUUID(), messages: []} });
    }
    await assert.rejects(applyStudyChange(client, user, { action: 'save', notebook: {...notebook, id: randomUUID()} }), { status: 409 });
    await assert.rejects(applyStudyChange(client, user, { action: 'save', notebook: {...notebook, messages: notebook.messages.slice(0, 1)} }), { status: 409 });

    step = '기록 및 TXT 원본';
    await applyStudyChange(client, user, { action: 'record', notebook });
    await applyStudyChange(client, user, { action: 'record', notebook });
    const archived = await loadWorkspace(client, user);
    assert.equal(archived.notebooks.length, 2);
    assert.equal(archived.records.length, 1);
    assert.ok(transcript(archived.records[0]).includes(notebook.messages[1].content));
    assert.equal((await loadWorkspace(client, other)).records.length, 0);
    await assert.rejects(applyStudyChange(client, other, { action: 'delete-original', id: notebook.id }), { status: 404 });

    step = '원본 삭제와 요약 유지';
    await applyStudyChange(client, user, { action: 'delete-original', id: notebook.id });
    const records = (await loadWorkspace(client, user)).records;
    assert.equal(records[0].content, '공부 요약');
    assert.deepEqual(records[0].messages, []);
    const { rows } = await client.query('SELECT count(*)::int AS count FROM study.messages WHERE notebook_id=$1', [notebook.id]);
    assert.equal(rows[0].count, 0);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error &&
      typeof error.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(error.code) ? error.code : 'UNKNOWN';
    throw new Error(`공부 저장 통합 테스트 실패 (${step}, ${code})`);
  } finally {
    if (client) {
      try { await client.query('ROLLBACK'); }
      finally { client.release(); }
    }
    await pool?.end();
  }
});
