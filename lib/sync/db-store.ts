import 'server-only';
import { transaction } from '../notebook-server.ts';
import { applyStudyChange, loadWorkspace } from '../study-sync.ts';
import { findOrCreateStudyUser } from '../study-users.ts';
import type { StudyStore } from './types.ts';

// 서버 pg 연결로 study 스키마를 읽고 쓴다. 사용자 행을 잠가 같은 계정의 동시 저장을 순서대로 처리한다.
export const dbStudyStore: StudyStore = {
  load: accountKey => transaction(async db => {
    const userId = await findOrCreateStudyUser(db, accountKey);
    await db.query('SELECT id FROM study.users WHERE id=$1 FOR SHARE', [userId]);
    return loadWorkspace(db, userId);
  }),
  apply: (accountKey, change) => transaction(async db => {
    const userId = await findOrCreateStudyUser(db, accountKey);
    await db.query('SELECT id FROM study.users WHERE id=$1 FOR UPDATE', [userId]);
    return applyStudyChange(db, userId, change);
  }),
};
