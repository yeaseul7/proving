import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import nextEnv from '@next/env';
import type { Pool, PoolClient } from 'pg';
import { readOwnProfile, readPublicProfile, saveProfile } from '../lib/profile-db.ts';
import { findOrCreateStudyUser } from '../lib/study-users.ts';

test('실제 DB에서 프로필 사진·설명 저장, 기존 아이디 유지, 공개 조회 범위를 검증하고 롤백한다', async () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    ({ db: pool } = await import('../lib/db.ts'));
    client = await pool.connect();
    await client.query('BEGIN');
    const user = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'));
    const handle = `t_${randomBytes(6).toString('hex')}`;

    const png = 'data:image/png;base64,iVBORw0KGgo=';
    assert.deepEqual(await readOwnProfile(client, user), { handle: null, displayName: null, avatar: null, intro: '', isPublic: false });
    assert.deepEqual(await saveProfile(client, user, { displayName: '테스트', avatar: png, intro: '소개' }),
      { handle: null, displayName: '테스트', avatar: png, intro: '소개', isPublic: false });
    // 아이디와 공개 여부는 편집 화면에서 바꾸지 않는다. 기존 값은 저장 후에도 유지된다.
    await client.query('UPDATE study.profiles SET handle=$2 WHERE user_id=$1', [user, handle]);
    assert.equal(await readPublicProfile(client, handle, '2026-11-05'), null, '비공개 프로필은 조회되지 않는다');
    await client.query('UPDATE study.profiles SET is_public=true WHERE user_id=$1', [user]);
    await saveProfile(client, user, { displayName: '테스트', avatar: png, intro: '## 소개' });
    assert.equal((await readOwnProfile(client, user)).handle, handle);

    const notebook = randomUUID();
    await client.query('INSERT INTO study.notebooks (id, user_id, status) VALUES ($1, $2, $3)', [notebook, user, 'archived']);
    await client.query(`INSERT INTO study.study_records (user_id, notebook_id, idempotency_key, title, study_date, summary)
      VALUES ($1, $2, $3, '비공개 제목', '2026-11-04', '{"schema_version":1,"markdown":"비공개 요약"}')`, [user, notebook, randomUUID()]);
    const profile = await readPublicProfile(client, handle.toUpperCase(), '2026-11-05');
    assert.ok(profile);
    assert.deepEqual({ ...profile, updatedAt: '' }, { handle, displayName: '테스트', avatar: png, intro: '## 소개', updatedAt: '', counts: { '2026-11-04': 1 } });
    assert.ok(!JSON.stringify(profile).includes('비공개'), '기록 제목·요약은 공개 데이터에 포함되지 않는다');
  } finally {
    await client?.query('ROLLBACK').catch(() => {});
    client?.release();
    await pool?.end();
  }
});
