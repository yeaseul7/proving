import 'server-only';
import { runtimeMode } from '../runtime-mode.ts';
import { chatgptPlanAi } from './chatgpt-plan.ts';
import { noAi } from './none.ts';
import type { AiProvider } from './types.ts';

export type { AiModel, AiProvider, AiRequest, AiStatus } from './types.ts';

export function getAi(): AiProvider {
  return runtimeMode().ai === 'none' ? noAi : chatgptPlanAi;
}
