import { validStoredMessages, type ChatMessage } from './chat.ts';
import { MAX_NOTEBOOKS, type Notebook } from './notebooks.ts';
import { dateKey, type StudyNote } from './study.ts';
import type { StudyQuery } from './study-users.ts';

export class StudySyncError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Row = StudyNote & { messages: ChatMessage[] };

const recordColumns = `
  r.notebook_id AS id, r.title, r.subject, r.study_date::text AS date,
  r.summary->>'markdown' AS content, r.updated_at AS "updatedAt",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content) ORDER BY m.position)
    FROM study.record_messages m WHERE m.record_id=r.id), '[]'::jsonb) AS messages,
  true AS cloud`;

export async function loadWorkspace(db: StudyQuery, userId: string) {
  const { rows: notebooks } = await db.query<Notebook>(`
    SELECT n.id, n.title, n.study_date::text AS date, n.draft, n.updated_at AS "updatedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content) ORDER BY m.position)
        FROM study.messages m WHERE m.notebook_id=n.id), '[]'::jsonb) AS messages
    FROM study.notebooks n WHERE n.user_id=$1 AND n.status='active' ORDER BY n.created_at, n.id
  `, [userId]);
  const { rows: closed } = await db.query<{id:string}>(
    "SELECT id FROM study.notebooks WHERE user_id=$1 AND status='archived'", [userId]);
  const { rows: records } = await db.query<Row>(
    `SELECT ${recordColumns} FROM study.study_records r WHERE r.user_id=$1 ORDER BY r.updated_at DESC`, [userId]);
  return { notebooks, closedIds: closed.map(row => row.id), records };
}

function checkedText(value: unknown, max: number, fallback?: string) {
  if (typeof value !== 'string' || value.includes('\0') || Array.from(value).length > max) {
    throw new StudySyncError('저장할 내용의 형식이나 길이가 올바르지 않습니다.');
  }
  const trimmed = value.trim() || fallback;
  if (!trimmed) throw new StudySyncError('저장할 내용이 비어 있습니다.');
  return trimmed;
}

function checkedDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || dateKey(new Date(value + 'T12:00:00')) !== value) {
    throw new StudySyncError('공부 날짜가 올바르지 않습니다.');
  }
  return value;
}

function checkedNotebook(value: unknown): Notebook {
  const n = value as Notebook;
  if (!n || !validStoredMessages(n.messages) ||
    (n.draft !== undefined && (typeof n.draft !== 'string' || n.draft.length > 20000 || n.draft.includes('\0')))) {
    throw new StudySyncError('대화의 형식이나 길이가 올바르지 않습니다.');
  }
  return { ...n, title: checkedText(n.title, 100, '제목 없는 노트'), date: checkedDate(n.date) };
}

export async function applyStudyChange(db: StudyQuery, userId: string, input: {
  action: string;
  id?: string;
  notebook?: Notebook;
  note?: StudyNote;
}) {
  const { action } = input;
  const id = input.notebook?.id ?? input.note?.id ?? input.id;
  if (typeof id !== 'string' || !uuid.test(id)) throw new StudySyncError('노트 ID가 올바르지 않습니다.');
  const { rows: [existing] } = await db.query<{status:string}>(
    'SELECT status FROM study.notebooks WHERE id=$1 AND user_id=$2', [id, userId]);

  if (action === 'edit-record' || action === 'delete-original' || action === 'delete-record') {
    const { rows: [record] } = await db.query<{id:string}>(
      'SELECT id FROM study.study_records WHERE notebook_id=$1 AND user_id=$2', [id, userId]);
    if (!record) throw new StudySyncError('공부 기록을 찾을 수 없습니다.', 404);
    if (action === 'edit-record') {
      await db.query(`
        UPDATE study.study_records SET title=$3, subject=$4, study_date=$5,
          summary=jsonb_build_object('schema_version', 1, 'markdown', $6::text),
          updated_at=clock_timestamp(), revision=revision+1
        WHERE id=$1 AND user_id=$2
      `, [record.id, userId, checkedText(input.note?.title, 100),
        checkedText(input.note?.subject, 40), checkedDate(input.note?.date), checkedText(input.note?.content, 200000)]);
    } else {
      await db.query('DELETE FROM study.record_messages WHERE record_id=$1 AND user_id=$2', [record.id, userId]);
      await db.query('DELETE FROM study.messages WHERE notebook_id=$1 AND user_id=$2', [id, userId]);
      if (action === 'delete-record') {
        await db.query('DELETE FROM study.study_records WHERE id=$1 AND user_id=$2', [record.id, userId]);
      } else {
        await db.query('UPDATE study.study_records SET updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2', [record.id, userId]);
      }
    }
    return {};
  }

  if (action === 'discard') {
    if (existing?.status === 'active') {
      await db.query('DELETE FROM study.messages WHERE notebook_id=$1 AND user_id=$2', [id, userId]);
      await db.query("UPDATE study.notebooks SET status='archived', draft='', updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2", [id, userId]);
    }
    return {};
  }
  if (action !== 'save' && action !== 'record') throw new StudySyncError('저장 요청이 올바르지 않습니다.');

  if (existing?.status === 'archived') {
    if (action === 'record') {
      const { rows: [record] } = await db.query<Row>(
        `SELECT ${recordColumns} FROM study.study_records r WHERE r.notebook_id=$1 AND r.user_id=$2`, [id, userId]);
      if (record) return { record };
    }
    throw new StudySyncError('이미 종료한 대화입니다. 새로고침해주세요.', 409);
  }

  const notebook = checkedNotebook(input.notebook);
  if (!existing) {
    const { rows: [{ count }] } = await db.query<{count:number}>(
      "SELECT count(*)::int AS count FROM study.notebooks WHERE user_id=$1 AND status='active'", [userId]);
    if (count >= MAX_NOTEBOOKS) throw new StudySyncError('진행 중인 대화는 최대 3개입니다.', 409);
    const inserted = await db.query(
      'INSERT INTO study.notebooks (id,user_id,title,study_date,draft) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',
      [id, userId, notebook.title, notebook.date, notebook.draft ?? '']);
    if (!inserted.rowCount) throw new StudySyncError('노트 ID가 이미 사용 중입니다.', 409);
  }

  const { rows: stored } = await db.query<ChatMessage>(
    'SELECT role, content FROM study.messages WHERE notebook_id=$1 AND user_id=$2 ORDER BY position', [id, userId]);
  if (stored.some((message, index) => message.role !== notebook.messages[index]?.role || message.content !== notebook.messages[index]?.content)) {
    throw new StudySyncError('다른 화면에서 대화가 변경되었습니다. 새로고침 후 이어서 공부해주세요.', 409);
  }
  const extra = notebook.messages.slice(stored.length).map((message, index) => ({
    role: message.role, content: message.content, position: stored.length + index + 1,
  }));
  if (extra.length) {
    await db.query(`
      INSERT INTO study.messages (user_id, notebook_id, client_message_id, position, role, content)
      SELECT $1, $2, gen_random_uuid(), position, role, content
      FROM jsonb_to_recordset($3::jsonb) AS m(position int, role text, content text)
    `, [userId, id, JSON.stringify(extra)]);
  }

  if (action === 'save') {
    await db.query(`
      UPDATE study.notebooks SET title=$3, draft=$4, study_date=$5, updated_at=clock_timestamp()
      WHERE id=$1 AND user_id=$2
    `, [id, userId, notebook.title, notebook.draft ?? '', notebook.date]);
    return {};
  }

  const summary = checkedText(notebook.summary, 200000);
  if (!notebook.messages.some(m => m.role === 'user') || !notebook.messages.some(m => m.role === 'assistant')) {
    throw new StudySyncError('기록하려면 질문과 답변이 있어야 합니다.');
  }
  const { rows: [{ id: recordId }] } = await db.query<{id:string}>(`
    INSERT INTO study.study_records (user_id,notebook_id,idempotency_key,title,study_date,summary)
    VALUES ($1,$2,$2,$3,$4,jsonb_build_object('schema_version', 1, 'markdown', $5::text)) RETURNING id
  `, [userId, id, notebook.title, notebook.date, summary]);
  await db.query(`
    INSERT INTO study.record_messages (user_id,notebook_id,record_id,message_id,position,role,content)
    SELECT user_id,notebook_id,$3,id,position,role,content
    FROM study.messages WHERE notebook_id=$1 AND user_id=$2
  `, [id, userId, recordId]);
  await db.query(`
    UPDATE study.notebooks SET status='archived', draft='', title=$3, study_date=$4, updated_at=clock_timestamp()
    WHERE id=$1 AND user_id=$2
  `, [id, userId, notebook.title, notebook.date]);
  const { rows: [record] } = await db.query<Row>(
    `SELECT ${recordColumns} FROM study.study_records r WHERE r.id=$1 AND r.user_id=$2`, [recordId, userId]);
  return { record };
}
