import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import nextEnv from '@next/env';
import type { Pool, PoolClient } from 'pg';
import { ProfileError, readOwnProfile, readPublicProfile, saveProfile } from '../lib/profile-db.ts';
import { findOrCreateStudyUser } from '../lib/study-users.ts';

test('실제 DB에서 프로필 저장, 아이디 중복, 공개 조회 범위를 검증하고 롤백한다', async () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    ({ db: pool } = await import('../lib/db.ts'));
    client = await pool.connect();
    await client.query('BEGIN');
    const user = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'));
    const other = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'));
    const handle = `t_${randomBytes(6).toString('hex')}`;

    assert.deepEqual(await readOwnProfile(client, user), { handle: null, displayName: null, intro: '', isPublic: true });
    await saveProfile(client, user, { handle, displayName: null, intro: '## 소개', isPublic: false });
    assert.equal(await readPublicProfile(client, handle, '2026-11-05'), null, '비공개 프로필은 조회되지 않는다');

    await saveProfile(client, user, { handle, displayName: '테스트', intro: '## 소개', isPublic: true });
    await client.query('SAVEPOINT duplicate');
    await assert.rejects(saveProfile(client, other, { handle, displayName: null, intro: '', isPublic: false }),
      (error: unknown) => error instanceof ProfileError && error.status === 409);
    await client.query('ROLLBACK TO SAVEPOINT duplicate');

    const notebook = randomUUID();
    await client.query('INSERT INTO study.notebooks (id, user_id, status) VALUES ($1, $2, $3)', [notebook, user, 'archived']);
    await client.query(`INSERT INTO study.study_records (user_id, notebook_id, idempotency_key, title, study_date, summary)
      VALUES ($1, $2, $3, '비공개 제목', '2026-11-04', '{"schema_version":1,"markdown":"비공개 요약"}')`, [user, notebook, randomUUID()]);
    const profile = await readPublicProfile(client, handle.toUpperCase(), '2026-11-05');
    assert.ok(profile);
    assert.deepEqual({ ...profile, updatedAt: '' }, { handle, displayName: '테스트', intro: '## 소개', updatedAt: '', counts: { '2026-11-04': 1 } });
    assert.ok(!JSON.stringify(profile).includes('비공개'), '기록 제목·요약은 공개 데이터에 포함되지 않는다');
  } finally {
    await client?.query('ROLLBACK').catch(() => {});
    client?.release();
    await pool?.end();
  }
});
