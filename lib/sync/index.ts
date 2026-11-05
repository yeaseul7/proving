import 'server-only';
import { runtimeMode } from '../runtime-mode.ts';
import { dbStudyStore } from './db-store.ts';
import { remoteStudyStore } from './remote-store.ts';
import type { StudyStore } from './types.ts';

export type { StudyChange, StudyChangeResult, StudyOwner, StudyStore, StudyWorkspace } from './types.ts';

export function getStudyStore(): StudyStore {
  return runtimeMode().store === 'remote' ? remoteStudyStore : dbStudyStore;
}
