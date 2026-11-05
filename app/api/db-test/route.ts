import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const { db } = await import('@/lib/db');
    const result = await db.query('SELECT current_database() AS database, NOW() AS time');
    return NextResponse.json({
      success: true,
      database: result.rows[0].database,
      time: result.rows[0].time,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const rawCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    // SQLSTATE 및 Node/TLS 코드만 공개하며 오류 메시지·스택은 출력하지 않는다.
    const code = typeof rawCode === 'string' && /^[A-Z0-9_]{2,64}$/.test(rawCode)
      ? rawCode : 'DB_CONNECTION_FAILED';
    console.error('DB connection failed');
    return NextResponse.json({
      success: false,
      message: '데이터베이스 연결 실패',
      code,
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
