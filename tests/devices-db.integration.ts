import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import nextEnv from '@next/env';
import type { Pool, PoolClient } from 'pg';
import { createLinkCode, listDevices, MAX_ACTIVE_DEVICES, redeemLinkCode, revokeDevice, userForDeviceToken } from '../lib/devices.ts';
import { findOrCreateStudyUser } from '../lib/study-users.ts';

test('실제 DB에서 신원 연결, 연결 코드 1회 사용, 기기 토큰 인증·폐기를 검증하고 롤백한다', async () => {
  let pool: Pool | undefined;
  let client: PoolClient | undefined;
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    ({ db: pool } = await import('../lib/db.ts'));
    client = await pool.connect();
    await client.query('BEGIN');
    const key = randomBytes(32).toString('hex');
    const google = await findOrCreateStudyUser(client, key, 'google');
    assert.equal(await findOrCreateStudyUser(client, key, 'google'), google, '같은 신원은 같은 사용자');
    assert.notEqual(await findOrCreateStudyUser(client, key, 'chatgpt'), google, '공급자가 다르면 다른 신원');
    const { rows: [user] } = await client.query('SELECT oauth_account_id FROM study.users WHERE id=$1', [google]);
    assert.equal(user.oauth_account_id, null, 'Google 사용자는 ChatGPT 계정 키가 없다');

    const { code } = await createLinkCode(client, google);
    assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    assert.equal(await redeemLinkCode(client, code, ''), null, '기기 이름이 없으면 거부');
    const linked = await redeemLinkCode(client, code.toLowerCase(), ' 내 맥북 ');
    if (!linked || !('token' in linked)) throw new Error('연결 코드로 기기를 연결하지 못했다');
    assert.equal(await redeemLinkCode(client, code, '다른 기기'), null, '같은 코드는 한 번만');
    assert.equal(await userForDeviceToken(client, linked.token), google);
    assert.equal(await userForDeviceToken(client, 'x'.repeat(43)), null);

    const { code: replaced } = await createLinkCode(client, google);
    await createLinkCode(client, google);
    assert.equal(await redeemLinkCode(client, replaced, '이전 코드'), null, '새 코드를 만들면 이전 코드는 무효');

    for (let i = 1; i < MAX_ACTIVE_DEVICES; i++) {
      const { code: extra } = await createLinkCode(client, google);
      assert.ok(await redeemLinkCode(client, extra, `기기 ${i}`));
    }
    const { code: overLimit } = await createLinkCode(client, google);
    assert.deepEqual(await redeemLinkCode(client, overLimit, '초과'), { error: 'device_limit' });
    assert.equal((await listDevices(client, google)).length, MAX_ACTIVE_DEVICES);

    const other = await findOrCreateStudyUser(client, randomBytes(32).toString('hex'), 'google');
    assert.equal(await revokeDevice(client, other, linked.deviceId), false, '다른 사용자의 기기는 끊을 수 없다');
    assert.equal(await revokeDevice(client, google, linked.deviceId), true);
    assert.equal(await userForDeviceToken(client, linked.token), null, '끊은 기기 토큰은 거부');
    const retried = await redeemLinkCode(client, overLimit, '초과였던 기기');
    assert.ok(retried && 'token' in retried, '제한으로 실패한 코드는 기기를 정리한 뒤 다시 쓸 수 있다');
  } finally {
    await client?.query('ROLLBACK').catch(() => {});
    client?.release();
    await pool?.end();
  }
});
