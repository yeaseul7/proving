import 'server-only';
import { authorizedSession, getSession } from '../chat-auth.ts';
import { readResponse } from '../chat.ts';
import { upstreamError } from '../siwc-errors.ts';
import type { AiProvider } from './types.ts';

const API = 'https://api.openai.com/v1';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';

// 로그인한 사용자의 ChatGPT 플랜으로 호출한다. 로컬 실행 전용이며 토큰은 chat-auth.ts의 로컬 세션에만 있다.
export const chatgptPlanAi: AiProvider = {
  async status() {
    const session = await getSession();
    return { mode: 'plan', canChat: Boolean(session?.scopes.includes(PLAN_SCOPE)) };
  },

  async prepare() {
    await authorizedSession();
  },

  async listModels() {
    const session = await authorizedSession();
    const response = await fetch(`${API}/models`, { headers: { Authorization: `Bearer ${session.access}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw await upstreamError(response);
    const body = await response.json();
    return Array.isArray(body.models)
      ? body.models.filter((m: Record<string, unknown>) => m.visibility === 'list' && typeof m.slug === 'string')
        .map((m: Record<string, unknown>) => ({ id: m.slug as string, name: typeof m.display_name === 'string' ? m.display_name : m.slug as string }))
      : [];
  },

  async respond({ model, messages, instructions, timeoutMs }) {
    const session = await authorizedSession();
    const response = await fetch(`${API}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: messages, store: false, stream: true, instructions }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw await upstreamError(response);
    if (!response.body) throw new Error('Empty response');
    return readResponse(response.body);
  },
};
