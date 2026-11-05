import { validStoredMessages, type ChatMessage } from './chat.ts';

export type StudyNote = { id: string; title: string; date: string; subject: string; content: string; updatedAt: string; ownerId?: string; cloud?: true; views?: number; comments?: {id:string;author:string;content:string;createdAt:string}[]; messages?: ChatMessage[] };
export const STORAGE_KEY = 'study-leaf-notes-v1';
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function isStudyNote(value: unknown): value is StudyNote {
  if (!value || typeof value !== 'object') return false;
  const n = value as Record<string, unknown>;
  return ['id','title','subject','content','updatedAt'].every(k => typeof n[k] === 'string') && typeof n.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && dateKey(new Date(`${n.date}T12:00:00`)) === n.date && (n.ownerId === undefined || typeof n.ownerId === 'string') && (n.views === undefined || (Number.isSafeInteger(n.views) && (n.views as number)>=0)) && (n.comments === undefined || (Array.isArray(n.comments) && n.comments.every(c=>c && ['id','author','content','createdAt'].every(k=>typeof c[k]==='string')))) && (n.messages === undefined || validStoredMessages(n.messages));
}
export function streak(notes: StudyNote[], today: string): number {
  const days = new Set(notes.map(n => n.date));
  const cursor = new Date(`${today}T12:00:00`);
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate()-1);
  let count = 0;
  while (days.has(dateKey(cursor))) { count++; cursor.setDate(cursor.getDate()-1); }
  return count;
}
export function markdown(note: StudyNote, language: 'ko'|'en' = 'ko'): string {
  if(language==='en')return `# ${note.title}\n\n- Study date: ${note.date}\n\n${note.content}\n`;
  return `# ${note.title}\n\n- 공부 날짜: ${note.date}\n- 주제: ${note.subject || '기타'}\n\n${note.content}\n`;
}

export function transcript(note: StudyNote, language: 'ko'|'en' = 'ko'): string {
  if(language==='en')return `Title: ${note.title}\nStudy date: ${note.date}\n\n${(note.messages??[]).map(m=>`[${m.role==='user'?'You':'GPT'}]\n${m.content}`).join('\n\n')}\n`;
  return `공부 제목: ${note.title}\n기록 날짜: ${note.date}\n주제: ${note.subject}\n\n${(note.messages ?? []).map(message => `[${message.role === 'user' ? '나' : 'GPT'}]\n${message.content}`).join('\n\n')}\n`;
}
