import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import nextEnv from '@next/env';
import type { Pool, PoolClient } from 'pg';
import { readPublicBlog } from '../lib/public-blog.ts';
import { findOrCreateStudyUser } from '../lib/study-users.ts';

test('실제 DB에서 공개 블로그는 소유자의 공부 요약만 내보내고 롤백한다', async () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    ({ db: pool } = await import('../lib/db.ts'));
    client = await pool.connect();
    await client.query('BEGIN');
    const owner = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'), 'google');
    const other = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'), 'google');
    const record = async (user: string, title: string, status: string) => {
      const notebook = randomUUID();
      await client!.query("INSERT INTO study.notebooks (id, user_id, status, draft) VALUES ($1, $2, $3, '비공개 초안')", [notebook, user, status]);
      await client!.query(`INSERT INTO study.messages (user_id, notebook_id, client_message_id, position, role, content)
        VALUES ($1, $2, $3, 1, 'user', '비공개 원본 대화')`, [user, notebook, randomUUID()]);
      if (status === 'archived') {
        await client!.query(`INSERT INTO study.study_records (user_id, notebook_id, idempotency_key, title, study_date, summary)
          VALUES ($1, $2, $3, $4, '2026-11-04', '{"schema_version":1,"markdown":"## 공개 요약"}')`, [user, notebook, randomUUID(), title]);
      }
      return notebook;
    };
    const published = await record(owner, '공개 기록', 'archived');
    await record(owner, '진행 중', 'active');
    await record(other, '다른 사람 기록', 'archived');
    await client.query("INSERT INTO study.profiles (user_id, display_name, intro_markdown) VALUES ($1, '예슬', '소개')", [owner]);

    const blog = await readPublicBlog(client, owner);
    assert.deepEqual(blog.owner, { name: '예슬', avatar: null, intro: '소개' });
    assert.equal(blog.records.length, 1, '기록한 노트만, 다른 사람 기록은 제외');
    assert.deepEqual({ ...blog.records[0], updatedAt: '' }, { id: published, title: '공개 기록', subject: 'GPT 공부', date: '2026-11-04', content: '## 공개 요약', updatedAt: '' });
    const exposed = JSON.stringify(blog);
    for (const secret of ['비공개 원본 대화', '비공개 초안', '진행 중', '다른 사람 기록', owner]) assert.ok(!exposed.includes(secret), `노출 금지: ${secret}`);
  } finally {
    await client?.query('ROLLBACK').catch(() => {});
    client?.release();
    await pool?.end();
  }
});
