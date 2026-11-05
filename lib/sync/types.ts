import type { applyStudyChange, loadWorkspace } from '../study-sync.ts';
import type { IdentityProvider } from '../study-users.ts';

export type StudyWorkspace = Awaited<ReturnType<typeof loadWorkspace>>;
export type StudyChange = Parameters<typeof applyStudyChange>[2];
export type StudyChangeResult = Awaited<ReturnType<typeof applyStudyChange>>;
// 로그인 신원 또는 기기 토큰으로 이미 확인한 내부 사용자.
export type StudyOwner = { provider: IdentityProvider; accountKey: string } | { userId: string };

// 공부 노트·기록 저장 위치. 서버 DB 직접 연결 또는 배포 사이트의 동기화 API.
export interface StudyStore {
  load(owner: StudyOwner): Promise<StudyWorkspace>;
  apply(owner: StudyOwner, change: StudyChange): Promise<StudyChangeResult>;
}
