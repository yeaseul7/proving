import type { StudyQuery } from './study-users.ts';

// 배포 사이트를 방문자에게 보여주는 읽기 전용 블로그. 소유자의 공부 요약만 내보낸다.
// 원본 대화, 진행 중 노트, 초안, 계정 식별자는 조회하지도 않는다.
export type PublicRecord = { id: string; title: string; subject: string; date: string; content: string; updatedAt: string };
export type PublicBlog = { owner: { name: string | null; avatar: string | null; intro: string }; records: PublicRecord[] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validOwnerId = (value: string | undefined): value is string => Boolean(value && uuid.test(value));

export async function readPublicBlog(db: StudyQuery, ownerId: string): Promise<PublicBlog> {
  const { rows: records } = await db.query<PublicRecord>(`
    SELECT r.notebook_id AS id, r.title, r.subject, r.study_date::text AS date,
      r.summary->>'markdown' AS content, to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
    FROM study.study_records r WHERE r.user_id=$1 ORDER BY r.study_date DESC, r.updated_at DESC LIMIT 1000
  `, [ownerId]);
  const { rows: [profile] } = await db.query<{ display_name: string | null; avatar: string | null; intro_markdown: string }>(
    'SELECT display_name, avatar, intro_markdown FROM study.profiles WHERE user_id=$1', [ownerId]);
  return {
    owner: { name: profile?.display_name ?? null, avatar: profile?.avatar ?? null, intro: profile?.intro_markdown ?? '' },
    records,
  };
}
