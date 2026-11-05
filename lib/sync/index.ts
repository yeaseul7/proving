import 'server-only';
import { runtimeMode } from '../runtime-mode.ts';
import { dbStudyStore } from './db-store.ts';
import type { StudyStore } from './types.ts';

export type { StudyChange, StudyChangeResult, StudyStore, StudyWorkspace } from './types.ts';

export function getStudyStore(): StudyStore {
  runtimeMode();
  return dbStudyStore;
}
