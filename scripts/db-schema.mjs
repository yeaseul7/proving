import nextEnv from '@next/env';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const apply = process.argv.includes('--apply');
const names = ['devices', 'link_codes', 'messages', 'notebooks', 'profiles', 'record_messages', 'study_records', 'user_identities', 'users'];
const applied = [];
let pool;
let client;
let phase = 'connect';

async function exposedSettings() {
  const { rows } = await client.query(`
    SELECT current_setting('pgrst.db_schemas', true) AS value
    UNION ALL
    SELECT substring(setting FROM length('pgrst.db_schemas=') + 1)
    FROM pg_db_role_setting CROSS JOIN LATERAL unnest(setconfig) AS setting
    WHERE setting LIKE 'pgrst.db_schemas=%'
  `);
  return rows.map(row => row.value).filter(Boolean);
}

async function expectRejected(sql, params, code) {
  await client.query('SAVEPOINT constraint_check');
  try {
    await assert.rejects(() => client.query(sql, params), { code });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT constraint_check');
    await client.query('RELEASE SAVEPOINT constraint_check');
  }
}

function migration(file) {
  return readFileSync(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
}

async function verifyProfileConstraints() {
  await client.query('SAVEPOINT profile_rows');
  try {
    const [owner, other] = [randomUUID(), randomUUID()];
    await client.query('INSERT INTO study.users(id, oauth_account_id) VALUES ($1, $2), ($3, $4)', [owner, owner.replaceAll('-', '').repeat(2), other, other.replaceAll('-', '').repeat(2)]);
    const profileSql = 'INSERT INTO study.profiles(user_id, handle, is_public) VALUES ($1, $2, $3)';
    await expectRejected(profileSql, [owner, 'Upper', false], '23514');
    await expectRejected(profileSql, [owner, null, true], '23514');
    await expectRejected(profileSql, [randomUUID(), 'ghost', false], '23503');
    await client.query(profileSql, [owner, 'verify_handle', true]);
    await expectRejected(profileSql, [other, 'verify_handle', false], '23505');
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT profile_rows');
    await client.query('RELEASE SAVEPOINT profile_rows');
  }
}

async function verifyAvatarConstraints() {
  await client.query('SAVEPOINT avatar_rows');
  try {
    const owner = randomUUID();
    await client.query('INSERT INTO study.users(id, oauth_account_id) VALUES ($1, $2)', [owner, owner.replaceAll('-', '').repeat(2)]);
    const avatarSql = 'INSERT INTO study.profiles(user_id, avatar) VALUES ($1, $2)';
    await expectRejected(avatarSql, [owner, 'data:image/svg+xml;base64,PHN2Zz4='], '23514');
    await expectRejected(avatarSql, [owner, 'https://example.com/a.png'], '23514');
    await client.query(avatarSql, [owner, 'data:image/png;base64,iVBORw0KGgo=']);
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT avatar_rows');
    await client.query('RELEASE SAVEPOINT avatar_rows');
  }
}

async function verifyIdentityConstraints() {
  const { rows: [{ missing }] } = await client.query(`SELECT count(*)::int AS missing FROM study.users u
    WHERE u.oauth_account_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM study.user_identities i
      WHERE i.user_id=u.id AND i.provider='chatgpt' AND i.account_key=u.oauth_account_id)`);
  assert.equal(missing, 0, 'Every existing user keeps its ChatGPT identity.');
  await client.query('SAVEPOINT identity_rows');
  try {
    const owner = randomUUID();
    const key = owner.replaceAll('-', '').repeat(2);
    await client.query('INSERT INTO study.users(id) VALUES ($1)', [owner]);
    const identitySql = 'INSERT INTO study.user_identities(user_id, provider, account_key) VALUES ($1, $2, $3)';
    await client.query(identitySql, [owner, 'google', key]);
    await expectRejected(identitySql, [owner, 'google', key], '23505');
    await expectRejected(identitySql, [owner, 'github', key], '23514');
    const deviceSql = 'INSERT INTO study.devices(user_id, name, token_hash) VALUES ($1, $2, $3)';
    await client.query(deviceSql, [owner, 'Mac', key]);
    await expectRejected(deviceSql, [owner, 'Other', key], '23505');
    await expectRejected(deviceSql, [owner, ' ', randomUUID().replaceAll('-', '').repeat(2)], '23514');
    await expectRejected("INSERT INTO study.link_codes(code_hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')", [key, owner], '23514');
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT identity_rows');
    await client.query('RELEASE SAVEPOINT identity_rows');
  }
}

async function verifyConstraints() {
  await client.query('SAVEPOINT verification_rows');
  try {
    const [owner, other] = [randomUUID(), randomUUID()];
    const [notebook, secondNotebook] = [randomUUID(), randomUUID()];
    const [message, secondMessage, record, messageKey, recordKey] = Array.from({ length: 5 }, () => randomUUID());
    await client.query('INSERT INTO study.users(id, oauth_account_id) VALUES ($1, $2), ($3, $4)', [owner, owner.replaceAll('-', '').repeat(2), other, other.replaceAll('-', '').repeat(2)]);
    await client.query('INSERT INTO study.notebooks(id, user_id) VALUES ($1, $2), ($3, $2)', [notebook, owner, secondNotebook]);
    const messageSql = "INSERT INTO study.messages(id, notebook_id, user_id, client_message_id, position, role, content) VALUES ($1,$2,$3,$4,$5,'user','migration verification')";
    await client.query(messageSql, [message, notebook, owner, messageKey, 1]);
    await client.query(messageSql, [secondMessage, secondNotebook, owner, randomUUID(), 1]);
    await expectRejected(messageSql, [randomUUID(), notebook, other, randomUUID(), 2], '23503');
    await expectRejected(messageSql, [randomUUID(), notebook, owner, messageKey, 2], '23505');
    await expectRejected(messageSql, [randomUUID(), notebook, owner, randomUUID(), 1], '23505');

    const recordSql = "INSERT INTO study.study_records(id, notebook_id, user_id, idempotency_key, title, study_date, summary) VALUES ($1,$2,$3,$4,'Verification',current_date,$5)";
    const summary = JSON.stringify({ schema_version: 1, markdown: 'Verification' });
    await expectRejected(recordSql, [randomUUID(), secondNotebook, owner, randomUUID(), '{}'], '23514');
    await client.query(recordSql, [record, notebook, owner, recordKey, summary]);
    await expectRejected(recordSql, [randomUUID(), notebook, owner, randomUUID(), summary], '23505');
    await expectRejected(recordSql, [randomUUID(), secondNotebook, owner, recordKey, summary], '23505');

    const snapshotSql = "INSERT INTO study.record_messages(record_id, message_id, notebook_id, user_id, position, role, content) VALUES ($1,$2,$3,$4,$5,'user','migration verification')";
    await expectRejected(snapshotSql, [record, secondMessage, notebook, owner, 1], '23503');
    await client.query(snapshotSql, [record, message, notebook, owner, 1]);
    await expectRejected(snapshotSql, [record, message, notebook, owner, 2], '23505');
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT verification_rows');
    await client.query('RELEASE SAVEPOINT verification_rows');
  }
}

try {
  ({ db: pool } = await import('../lib/db.ts'));
  client = await pool.connect();
  phase = 'preflight';
  const settings = await exposedSettings();
  const exposureConfigured = settings.some(value => value.split(',').some(name => ['study', '*'].includes(name.trim().replaceAll('"', ''))));
  if (exposureConfigured) throw new Error('Study is listed in a database-visible Data API schema setting.');

  if (apply) {
    // 아직 적용하지 않은 마이그레이션만 순서대로 적용한다. 기존 테이블은 수정·삭제하지 않는다.
    const { rows: [state] } = await client.query(`SELECT
      EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='study') AS schema,
      to_regclass('study.profiles') IS NOT NULL AS profiles,
      to_regclass('study.user_identities') IS NOT NULL AS identities,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='study' AND table_name='profiles' AND column_name='avatar') AS avatar`);
    // SQL 파일은 단독 실행도 가능하다. 이 실행기에서는 검증까지 같은 트랜잭션에 넣는다.
    await client.query('BEGIN');
    if (!state.schema) {
      phase = 'migration 001';
      await client.query(migration('001_initial_schema.sql'));
      phase = 'constraint verification 001';
      await verifyConstraints();
      applied.push('001_initial_schema');
    }
    if (!state.profiles) {
      phase = 'migration 002';
      await client.query(migration('002_profiles.sql'));
      phase = 'constraint verification 002';
      await verifyProfileConstraints();
      applied.push('002_profiles');
    }
    if (!state.identities) {
      phase = 'migration 003';
      await client.query(migration('003_identities_devices.sql'));
      phase = 'constraint verification 003';
      await verifyIdentityConstraints();
      applied.push('003_identities_devices');
    }
    if (!state.avatar) {
      phase = 'migration 004';
      await client.query(migration('004_profile_avatar.sql'));
      phase = 'constraint verification 004';
      await verifyAvatarConstraints();
      applied.push('004_profile_avatar');
    }
  }

  phase = 'metadata verification';
  const { rows: tables } = await client.query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls,
      (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='p') AS primary_keys,
      (SELECT count(*)::int FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype='f') AS foreign_keys,
      (SELECT count(*)::int FROM pg_index i WHERE i.indrelid=c.oid) AS indexes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='study' AND c.relkind='r' ORDER BY c.relname
  `);
  const { rows: grants } = await client.query(`
    SELECT role, has_schema_privilege(role, 'study', 'USAGE') AS schema_usage,
      EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='study' AND
        has_table_privilege(role, format('%I.%I', schemaname, tablename), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS table_access
    FROM unnest(ARRAY['anon','authenticated','service_role']) AS role
  `);
  const { rows: types } = await client.query(`
    SELECT table_name, column_name, udt_name FROM information_schema.columns
    WHERE table_schema='study' AND (column_name='id' OR (table_name='study_records' AND column_name='summary'))
  `);
  assert.equal(types.filter(column => column.column_name === 'id' && column.udt_name === 'uuid').length, 6);
  assert.ok(types.some(column => column.table_name === 'study_records' && column.column_name === 'summary' && column.udt_name === 'jsonb'));
  assert.deepEqual(tables.map(table => table.name), names);
  assert.ok(tables.every(table => table.rls && table.primary_keys === 1));
  assert.ok(grants.every(grant => !grant.schema_usage && !grant.table_access));
  const counts = {};
  for (const name of names) counts[name] = Number((await client.query(`SELECT count(*) FROM study.${name}`)).rows[0].count);
  if (apply) {
    if (applied.includes('001_initial_schema')) assert.ok(Object.values(counts).every(count => count === 0));
    phase = 'commit';
    await client.query('COMMIT');
  }
  console.log(JSON.stringify({ applied, tables, grants, rowCounts: counts, databaseVisibleExposureSettings: settings.length > 0 ? 'study_not_listed' : 'not_available', constraintTests: applied.length ? 'passed_and_rolled_back' : 'not_run' }, null, 2));
} catch (error) {
  if (client && apply) await client.query('ROLLBACK').catch(() => {});
  // 서버 원문에는 접속 주소·SQL 값이 포함될 수 있어 구조화된 진단만 표시한다.
  console.error(JSON.stringify({ phase, code: error.code, severity: error.severity, schema: error.schema, table: error.table, column: error.column, constraint: error.constraint, position: error.position, message: !error.code && phase === 'preflight' ? error.message : 'Schema operation failed; raw values omitted.' }));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
