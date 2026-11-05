import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  const caPath = process.env.SUPABASE_CA_PATH;
  // 배포 환경은 파일 대신 PEM 본문을 환경변수(SUPABASE_CA_CERT)로 받는다. 줄바꿈은 \n으로 넣어도 된다.
  const caText = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n');
  if (!connectionString || (!caPath && !caText)) {
    throw Object.assign(new Error('Database configuration missing'), { code: 'DB_CONFIG_MISSING' });
  }

  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw Object.assign(new Error('Database configuration invalid'), { code: 'DB_CONFIG_INVALID' });
  }
  // pg가 URL을 파싱하면서 명시적인 ssl 객체를 덮어쓰지 않도록 제거한다.
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('ssl') || key.toLowerCase() === 'uselibpqcompat') {
      url.searchParams.delete(key);
    }
  }

  const ca = caText || readFileSync(path.resolve(process.cwd(), caPath!), 'utf8');
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    // 서버리스 인스턴스가 많아질 수 있어 배포에서는 작게 둔다(DB_POOL_MAX=1). 연결은 Supabase transaction pooler(6543)를 쓴다.
    max: Number(process.env.DB_POOL_MAX) || 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  // 유휴 연결 오류의 원문에는 접속 정보가 포함될 수 있어 로깅하지 않는다.
  pool.on('error', () => { console.error('DB idle connection failed'); });
  return pool;
}

export const db = globalForDb.pgPool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = db;
