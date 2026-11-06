// 운영자용: 내 ChatGPT 로그인 사용자들과 Google 로그인 사용자를 한 명의 소유자로 합친다.
// 로컬 ChatGPT 공부 기록이 배포 블로그(Google 계정 소유자)에 바로 보이게 한다.
// 기본은 확인만 하고 롤백한다. --apply일 때만 커밋한다.
//   node --conditions=react-server --experimental-strip-types scripts/merge-owner.mjs you@gmail.com [--apply]
import nextEnv from '@next/env';
import { createHash } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const email = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!email || !supabaseUrl) {
  console.error('사용법: ... merge-owner.mjs <Google 이메일> [--apply]  (.env.local에 NEXT_PUBLIC_SUPABASE_URL 필요)');
  process.exit(1);
}

const { db: pool } = await import('../lib/db.ts');
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows: authUsers } = await client.query('SELECT id FROM auth.users WHERE lower(email)=lower($1)', [email]);
  if (authUsers.length !== 1) throw new Error('이 이메일로 Google 로그인한 사용자를 찾지 못했습니다. 배포 사이트에 먼저 로그인해주세요.');
  const googleKey = createHash('sha256').update(`${supabaseUrl}/auth/v1:${authUsers[0].id}`).digest('hex');
  const { rows: [owner] } = await client.query(
    "SELECT user_id FROM study.user_identities WHERE provider='google' AND account_key=$1 FOR UPDATE", [googleKey]);
  if (!owner) throw new Error('Google 계정의 proving 사용자가 없습니다. 배포 사이트에 먼저 로그인해주세요.');
  const target = owner.user_id;
  const { rows: sources } = await client.query(
    "SELECT DISTINCT user_id FROM study.user_identities WHERE provider='chatgpt' AND user_id<>$1", [target]);
  const from = sources.map(row => row.user_id);
  if (!from.length) { console.log('합칠 ChatGPT 사용자가 없습니다. 이미 한 명입니다.'); await client.query('ROLLBACK'); process.exit(0); }

  const { rows: [profiles] } = await client.query(
    'SELECT count(*)::int AS n FROM study.profiles WHERE user_id = ANY($1::uuid[])', [from]);
  if (profiles.n > 0) throw new Error('합칠 사용자에게 프로필이 있어 자동으로 합치지 않습니다.');
  const { rows: [active] } = await client.query(
    "SELECT count(*)::int AS n FROM study.notebooks WHERE status='active' AND user_id = ANY($1::uuid[])", [[target, ...from]]);
  if (active.n > 3) throw new Error(`합치면 진행 중 노트가 ${active.n}개가 되어 3개 제한을 넘습니다. 먼저 일부를 기록하거나 정리해주세요.`);

  // 노트·메시지·기록은 (노트, 사용자) 복합 외래키로 묶여 있다. 한 문장에서 함께 옮기면 외래키 검사가 문장 끝에 한 번만 일어난다.
  const { rows: [moved] } = await client.query(`
    WITH n AS (UPDATE study.notebooks SET user_id=$1 WHERE user_id = ANY($2::uuid[]) RETURNING 1),
      m AS (UPDATE study.messages SET user_id=$1 WHERE user_id = ANY($2::uuid[]) RETURNING 1),
      r AS (UPDATE study.study_records SET user_id=$1 WHERE user_id = ANY($2::uuid[]) RETURNING 1),
      rm AS (UPDATE study.record_messages SET user_id=$1 WHERE user_id = ANY($2::uuid[]) RETURNING 1),
      d AS (UPDATE study.devices SET user_id=$1 WHERE user_id = ANY($2::uuid[]) RETURNING 1),
      lc AS (UPDATE study.link_codes SET user_id=$1 WHERE user_id = ANY($2::uuid[]) RETURNING 1),
      i AS (UPDATE study.user_identities SET user_id=$1 WHERE user_id = ANY($2::uuid[]) RETURNING 1)
    SELECT (SELECT count(*) FROM n)::int AS notebooks, (SELECT count(*) FROM m)::int AS messages,
      (SELECT count(*) FROM r)::int AS records, (SELECT count(*) FROM rm)::int AS record_messages,
      (SELECT count(*) FROM d)::int AS devices, (SELECT count(*) FROM i)::int AS identities
  `, [target, from]);
  const { rows: [after] } = await client.query(`SELECT
    (SELECT count(*) FROM study.notebooks WHERE user_id=$1)::int AS notebooks,
    (SELECT count(*) FROM study.study_records WHERE user_id=$1)::int AS records,
    (SELECT string_agg(provider, ',' ORDER BY provider) FROM study.user_identities WHERE user_id=$1) AS logins`, [target]);
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run (rolled back)', mergedUsers: from.length, moved, owner: { userId: target, ...after } }, null, 2));
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error instanceof Error && !('code' in error) ? error.message : `합치지 못했습니다. (DB 오류 ${error?.code ?? ''} ${error?.constraint ?? ''})`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
