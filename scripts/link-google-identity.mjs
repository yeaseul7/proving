// 운영자용: 기존(ChatGPT 로그인) 사용자의 노트를 배포 사이트 Google 계정에서도 보이게 같은 사용자로 연결한다.
// 배포 사이트에 Google로 한 번 로그인한 뒤 실행한다. 기본은 확인만 하고, --apply일 때만 변경한다.
//   node --conditions=react-server --experimental-strip-types scripts/link-google-identity.mjs you@gmail.com [--apply]
import nextEnv from '@next/env';
import { createHash } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const email = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!email || !supabaseUrl) {
  console.error('사용법: ... link-google-identity.mjs <Google 이메일> [--apply]  (.env.local에 NEXT_PUBLIC_SUPABASE_URL 필요)');
  process.exit(1);
}

const { db: pool } = await import('../lib/db.ts');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows: authUsers } = await client.query('SELECT id FROM auth.users WHERE lower(email)=lower($1)', [email]);
  if (authUsers.length !== 1) throw new Error('이 이메일로 Google 로그인한 Supabase 사용자를 찾지 못했습니다. 배포 사이트에서 먼저 로그인해주세요.');
  const googleKey = createHash('sha256').update(`${supabaseUrl}/auth/v1:${authUsers[0].id}`).digest('hex');

  // 노트가 있는 ChatGPT 사용자가 정확히 하나일 때만 자동으로 고른다.
  const { rows: owners } = await client.query(`
    SELECT i.user_id, (SELECT count(*)::int FROM study.notebooks n WHERE n.user_id=i.user_id) AS notebooks
    FROM study.user_identities i WHERE i.provider='chatgpt'
  `);
  const withData = owners.filter(owner => owner.notebooks > 0);
  if (withData.length !== 1) throw new Error(`노트가 있는 ChatGPT 사용자가 ${withData.length}명입니다. 자동으로 고를 수 없습니다.`);
  const target = withData[0].user_id;

  const { rows: [current] } = await client.query(
    "SELECT user_id FROM study.user_identities WHERE provider='google' AND account_key=$1 FOR UPDATE", [googleKey]);
  if (current?.user_id === target) {
    console.log('이미 연결되어 있습니다.');
  } else {
    if (current) {
      // Google 로그인으로 새로 생긴 사용자에 데이터가 있으면 옮기지 않는다.
      const { rows: [{ total }] } = await client.query(`SELECT
        (SELECT count(*) FROM study.notebooks WHERE user_id=$1) + (SELECT count(*) FROM study.profiles WHERE user_id=$1) +
        (SELECT count(*) FROM study.devices WHERE user_id=$1) AS total`, [current.user_id]);
      if (Number(total) > 0) throw new Error('Google 계정 쪽에도 이미 데이터가 있어 자동으로 합치지 않습니다.');
      await client.query("UPDATE study.user_identities SET user_id=$1 WHERE provider='google' AND account_key=$2", [target, googleKey]);
    } else {
      await client.query("INSERT INTO study.user_identities (user_id, provider, account_key) VALUES ($1, 'google', $2)", [target, googleKey]);
    }
    console.log(`Google 계정을 기존 사용자(노트 ${withData[0].notebooks}개)에 연결${apply ? '했습니다' : '합니다 (확인만, --apply로 실행)'}.`);
  }
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error instanceof Error && !('code' in error) ? error.message : '연결하지 못했습니다. (DB 오류)');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
