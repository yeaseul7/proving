import { SiwcError } from '../siwc-errors.ts';
import type { AiProvider } from './types.ts';

// 배포 사이트용. 사용자 ChatGPT 플랜은 로컬 학습 앱에서만 쓰므로 여기서는 GPT를 호출하지 않는다.
const unavailable = () => { throw new SiwcError(403, 'ai_unavailable_on_site'); };

export const noAi: AiProvider = {
  status: async () => ({ mode: 'none', canChat: false }),
  prepare: async () => unavailable(),
  listModels: async () => [],
  respond: async () => unavailable(),
};
