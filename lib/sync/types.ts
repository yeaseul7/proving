import type { applyStudyChange, loadWorkspace } from '../study-sync.ts';

export type StudyWorkspace = Awaited<ReturnType<typeof loadWorkspace>>;
export type StudyChange = Parameters<typeof applyStudyChange>[2];
export type StudyChangeResult = Awaited<ReturnType<typeof applyStudyChange>>;

// 공부 노트·기록 저장 위치. 지금은 서버 DB 직접 연결뿐이고, 원격 동기화 API 구현을 추가할 자리다.
export interface StudyStore {
  load(accountKey: string): Promise<StudyWorkspace>;
  apply(accountKey: string, change: StudyChange): Promise<StudyChangeResult>;
}
