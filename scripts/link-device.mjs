// 이 PC의 proving을 배포 사이트 계정에 연결한다.
// 사용법: 배포 사이트 → 개요 → 연결된 기기에서 코드를 받은 뒤 `npm run link -- ABCD-EFGH-JKMN`
import nextEnv from '@next/env';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const [code, ...nameParts] = process.argv.slice(2);
const site = process.env.PROVING_SYNC_URL;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!code) fail('연결 코드를 입력해주세요. 예: npm run link -- ABCD-EFGH-JKMN');
let url;
try { url = new URL('/api/devices/link', site); } catch { fail('.env.local에 PROVING_SYNC_URL(배포 사이트 주소)을 설정해주세요.'); }
if (url.protocol !== 'https:') fail('PROVING_SYNC_URL은 https 주소여야 합니다.');

const name = (nameParts.join(' ') || hostname()).slice(0, 60);
let response;
try {
  response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name }),
    signal: AbortSignal.timeout(20_000),
  });
} catch { fail('배포 사이트에 연결하지 못했습니다. 주소와 네트워크를 확인해주세요.'); }
const data = await response.json().catch(() => ({}));
if (!response.ok || typeof data.token !== 'string') fail(data.error || `연결하지 못했습니다. (HTTP ${response.status})`);

// 기기 토큰은 이 PC에만, 소유자만 읽을 수 있게 저장한다. 출력하지 않는다.
const directory = path.join(process.cwd(), '.local');
await mkdir(directory, { recursive: true, mode: 0o700 });
const file = path.join(directory, 'sync.json');
const temporary = `${file}.${process.pid}.tmp`;
await writeFile(temporary, JSON.stringify({ url: url.origin, token: data.token, deviceId: data.deviceId, name }), { mode: 0o600, flag: 'wx' });
await rename(temporary, file);
console.log(`"${name}" 기기를 ${url.origin}에 연결했습니다.`);
console.log('.env.local에 STUDY_STORE=remote가 있는지 확인한 뒤 개발 서버를 다시 시작하세요.');
