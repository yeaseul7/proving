import type { Notebook } from './notebooks';
import type { StudyNote } from './study';

export type StoredStudyNote = StudyNote & { cloud: true };

export async function loadStudy(account: string, signal?: AbortSignal): Promise<{
  notebooks: Notebook[];
  closedIds: string[];
  records: StoredStudyNote[];
}> {
  const response = await fetch('/api/study-sync', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('서버 공부 기록을 불러오지 못했습니다.');
  const data = await response.json();
  if (data.account !== account) throw new Error('계정이 변경되었습니다. 다시 로그인해주세요.');
  return data;
}

export async function writeStudy(account: string, command:
  | { action: 'save' | 'record'; notebook: Notebook }
  | { action: 'discard' | 'delete-original' | 'delete-record'; id: string }
  | { action: 'edit-record'; note: StudyNote }
): Promise<{ record?: StoredStudyNote }> {
  const response = await fetch('/api/study-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, ...command }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '서버에 저장하지 못했습니다.');
  return data;
}
