import { EMPTY_PROFILE, HANDLE_PATTERN, type Profile, type ProfileInput, type PublicProfile } from './profile.ts';
import type { StudyQuery } from './study-users.ts';

export class ProfileError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

type Row = { handle: string | null; display_name: string | null; avatar: string | null; intro_markdown: string; is_public: boolean };
const toProfile = (row: Row): Profile => ({ handle: row.handle, displayName: row.display_name, avatar: row.avatar, intro: row.intro_markdown, isPublic: row.is_public });
const columns = 'handle, display_name, avatar, intro_markdown, is_public';

export async function readOwnProfile(db: StudyQuery, userId: string): Promise<Profile> {
  const { rows: [row] } = await db.query<Row>(
    `SELECT ${columns} FROM study.profiles WHERE user_id=$1`, [userId]);
  return row ? toProfile(row) : EMPTY_PROFILE;
}

// 이름·사진·설명만 바꾼다. 이미 정한 아이디와 공개 여부는 그대로 둔다.
export async function saveProfile(db: StudyQuery, userId: string, profile: ProfileInput): Promise<Profile> {
  const { rows: [row] } = await db.query<Row>(`
    INSERT INTO study.profiles (user_id, display_name, avatar, intro_markdown)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name, avatar=EXCLUDED.avatar,
      intro_markdown=EXCLUDED.intro_markdown, updated_at=clock_timestamp()
    RETURNING ${columns}
  `, [userId, profile.displayName, profile.avatar, profile.intro]);
  return toProfile(row);
}

// 공개로 설정한 프로필만 반환한다. 기록은 날짜별 개수만 내보내고 제목·내용은 포함하지 않는다.
export async function readPublicProfile(db: StudyQuery, handle: string, today: string): Promise<PublicProfile | null> {
  const clean = handle.toLowerCase();
  if (!HANDLE_PATTERN.test(clean)) return null;
  const { rows: [row] } = await db.query<{ user_id: string; handle: string; display_name: string | null; avatar: string | null; intro_markdown: string; updated_at: Date }>(
    'SELECT user_id, handle, display_name, avatar, intro_markdown, updated_at FROM study.profiles WHERE handle=$1 AND is_public', [clean]);
  if (!row) return null;
  const { rows } = await db.query<{ day: string; count: number }>(`
    SELECT to_char(study_date, 'YYYY-MM-DD') AS day, count(*)::int AS count FROM study.study_records
    WHERE user_id=$1 AND study_date > $2::date - interval '1 year' AND study_date <= $2::date
    GROUP BY study_date
  `, [row.user_id, today]);
  return {
    handle: row.handle,
    displayName: row.display_name ?? row.handle,
    avatar: row.avatar,
    intro: row.intro_markdown,
    updatedAt: row.updated_at.toISOString(),
    counts: Object.fromEntries(rows.map(r => [r.day, r.count])),
  };
}
