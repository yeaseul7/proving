import { MAX_NOTEBOOKS } from './notebooks.ts';
import { findOrCreateStudyUser, type StudyQuery } from './study-users.ts';

type Status = 'active' | 'archived';
type Notebook = { id: string; title: string; status: Status; studyDate: string; draft: string; createdAt: Date; updatedAt: Date };
type Dependencies = {
  account: () => Promise<string | null>;
  checkOrigin: (request: Request, mutation: boolean) => void;
  transaction: <T>(work: (db: StudyQuery) => Promise<T>) => Promise<T>;
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns = 'id, title, status, study_date::text AS "studyDate", draft, created_at AS "createdAt", updated_at AS "updatedAt"';
const defaultTitle = '제목 없는 노트';
const bodyLimit = 4096;

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const badInput = () => new ApiError(400, 'invalid_input', '요청 값이 올바르지 않습니다.');
const notFound = () => new ApiError(404, 'notebook_not_found', '공부 노트를 찾을 수 없습니다.');

function json(body: unknown, status = 200, location?: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (location) headers.set('Location', location);
  return Response.json(body, { status, headers });
}
function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw badInput();
  return value.toLowerCase();
}
function title(value: unknown): string {
  if (typeof value !== 'string') throw badInput();
  const trimmed = value.trim();
  if (!trimmed || Array.from(trimmed).length > 100 || /[\x00-\x1f\x7f]/.test(trimmed)) throw badInput();
  return trimmed;
}
function status(value: unknown): Status {
  if (value !== 'active' && value !== 'archived') throw badInput();
  return value;
}
function integer(value: string | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw badInput();
  return Number(value);
}
async function readBody(request: Request, allowed: string[]): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'unsupported_media_type', 'application/json 본문이 필요합니다.');
  }
  if (!request.body) throw badInput();
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let raw = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > bodyLimit) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, 'body_too_large', '요청 본문이 너무 큽니다.');
      }
      raw += decoder.decode(value, { stream: true });
    }
    const value: unknown = JSON.parse(raw + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw badInput();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw badInput();
  } finally {
    reader.releaseLock();
  }
}

async function owned(db: StudyQuery, userId: string, id: string) {
  return (await db.query<Notebook>(`SELECT ${columns} FROM study.notebooks WHERE id = $1::uuid AND user_id = $2::uuid`, [id, userId])).rows[0];
}
async function lockUser(db: StudyQuery, userId: string) {
  await db.query('SELECT id FROM study.users WHERE id = $1::uuid FOR UPDATE', [userId]);
}
async function checkActiveLimit(db: StudyQuery, userId: string) {
  const { rows } = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM study.notebooks WHERE user_id = $1::uuid AND status = 'active'", [userId],
  );
  if (rows[0].count >= MAX_NOTEBOOKS) throw new ApiError(409, 'active_notebook_limit', '진행 중인 공부 노트는 최대 3개입니다.');
}

export function createNotebookApi(deps: Dependencies) {
  async function handle(request: Request, mutation: boolean, action: (account: string) => Promise<Response>) {
    try {
      try { deps.checkOrigin(request, mutation); }
      catch { throw new ApiError(403, 'invalid_origin', '요청 출처를 확인할 수 없습니다.'); }
      const account = await deps.account();
      if (!account || !/^[a-f0-9]{64}$/.test(account)) throw new ApiError(401, 'authentication_required', 'ChatGPT 계정 로그인이 필요합니다.');
      return await action(account);
    } catch (error) {
      if (error instanceof ApiError) return json({ code: error.code, message: error.message }, error.status);
      // 드라이버 오류의 메시지, 입력값, 연결 주소는 로그와 응답에 남기지 않는다.
      return json({ code: 'notebook_service_unavailable', message: '공부 노트에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' }, 503);
    }
  }

  return {
    list: (request: Request) => handle(request, false, async account => {
      const params = new URL(request.url).searchParams;
      for (const key of params.keys()) {
        if (!['status', 'limit', 'offset'].includes(key) || params.getAll(key).length !== 1) throw badInput();
      }
      const filter = params.has('status') ? status(params.get('status')) : null;
      const limit = integer(params.get('limit'), 50, 1, 100);
      const offset = integer(params.get('offset'), 0, 0, 10000);
      return deps.transaction(async db => {
        const userId = await findOrCreateStudyUser(db, account);
        const { rows } = await db.query<Notebook>(`
          SELECT ${columns} FROM study.notebooks
          WHERE user_id = $1::uuid AND ($2::text IS NULL OR status = $2)
          ORDER BY updated_at DESC, id DESC LIMIT $3 OFFSET $4
        `, [userId, filter, limit + 1, offset]);
        return json({ notebooks: rows.slice(0, limit), limit, offset, hasMore: rows.length > limit });
      });
    }),
    create: (request: Request) => handle(request, true, async account => {
      const body = await readBody(request, ['id', 'title']);
      const id = uuid(body.id);
      const name = Object.hasOwn(body, 'title') ? title(body.title) : defaultTitle;
      return deps.transaction(async db => {
        const userId = await findOrCreateStudyUser(db, account);
        await lockUser(db, userId);
        const existing = await owned(db, userId, id);
        const location = `/api/notebooks/${id}`;
        // 같은 사용자의 같은 UUID는 최초 생성에 대한 재전송으로 처리한다.
        if (existing) return json({ notebook: existing }, 200, location);
        await checkActiveLimit(db, userId);
        const { rows } = await db.query<Notebook>(`
          INSERT INTO study.notebooks (id, user_id, title) VALUES ($1::uuid, $2::uuid, $3)
          ON CONFLICT (id) DO NOTHING RETURNING ${columns}
        `, [id, userId, name]);
        if (!rows[0]) throw new ApiError(409, 'notebook_id_conflict', '다른 노트 UUID를 사용해주세요.');
        return json({ notebook: rows[0] }, 201, location);
      });
    }),
    get: (request: Request, rawId: string) => handle(request, false, async account => {
      const id = uuid(rawId);
      return deps.transaction(async db => {
        const userId = await findOrCreateStudyUser(db, account);
        const notebook = await owned(db, userId, id);
        if (!notebook) throw notFound();
        return json({ notebook });
      });
    }),
    patch: (request: Request, rawId: string) => handle(request, true, async account => {
      const id = uuid(rawId);
      const body = await readBody(request, ['title', 'status']);
      if (Object.keys(body).length === 0) throw badInput();
      const name = Object.hasOwn(body, 'title') ? title(body.title) : undefined;
      const nextStatus = Object.hasOwn(body, 'status') ? status(body.status) : undefined;
      return deps.transaction(async db => {
        const userId = await findOrCreateStudyUser(db, account);
        await lockUser(db, userId);
        const existing = await owned(db, userId, id);
        if (!existing) throw notFound();
        const finalTitle = name ?? existing.title;
        const finalStatus = nextStatus ?? existing.status;
        if (existing.title === finalTitle && existing.status === finalStatus) return json({ notebook: existing });
        if (finalStatus === 'active' && existing.status !== 'active') await checkActiveLimit(db, userId);
        const { rows } = await db.query<Notebook>(`
          UPDATE study.notebooks SET title = $3, status = $4, updated_at = clock_timestamp()
          WHERE id = $1::uuid AND user_id = $2::uuid RETURNING ${columns}
        `, [id, userId, finalTitle, finalStatus]);
        if (!rows[0]) throw notFound();
        return json({ notebook: rows[0] });
      });
    }),
  };
}
