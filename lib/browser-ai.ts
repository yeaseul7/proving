import { apiMessages, type ChatMessage } from './chat.ts';
import type { StudyLanguage } from './prompts.ts';

// OpenAI·Claude·Gemini는 사용자의 API 키로 브라우저가 직접 호출한다. 키는 이 브라우저 저장소에만 있고 서버로 보내지 않는다.
export type BrowserProvider = 'openai' | 'anthropic' | 'gemini';
export type BrowserKeys = Partial<Record<BrowserProvider, string>>;
export type BrowserModel = { id: string; name: string; provider: BrowserProvider };
export const BROWSER_PROVIDERS: Record<BrowserProvider, { label: string; consoleUrl: string }> = {
  openai: { label: 'OpenAI', consoleUrl: 'https://platform.openai.com/api-keys' },
  anthropic: { label: 'Claude', consoleUrl: 'https://console.anthropic.com/settings/keys' },
  gemini: { label: 'Gemini', consoleUrl: 'https://aistudio.google.com/apikey' },
};
const STORAGE_KEY = 'proving-ai-keys';
const validKey = (value: unknown): value is string => typeof value === 'string' && /^[\x21-\x7e]{20,300}$/.test(value);

function parseKeys(raw: string | null): BrowserKeys {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries((Object.keys(BROWSER_PROVIDERS) as BrowserProvider[]).filter(p => validKey(value?.[p])).map(p => [p, value[p]]));
  } catch { return {}; }
}
// 기억하기를 끄면 sessionStorage에 두어 탭을 닫을 때 지운다.
export function readKeys(): { keys: BrowserKeys; remember: boolean } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { keys: parseKeys(stored), remember: true };
    return { keys: parseKeys(sessionStorage.getItem(STORAGE_KEY)), remember: false };
  } catch { return { keys: {}, remember: false }; }
}
export function saveKeys(keys: BrowserKeys, remember: boolean) {
  const clean = Object.fromEntries(Object.entries(keys).filter(([, value]) => validKey(value)));
  localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(STORAGE_KEY);
  if (Object.keys(clean).length) (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean as BrowserKeys;
}
export const isValidKey = validKey;

// 선택 목록에서는 "openai:gpt-5", "anthropic:claude-opus-5-5"처럼 공급자를 붙여 GPT 모델과 구분한다.
export function browserRoute(id: string): { provider: BrowserProvider; model: string } | null {
  const match = /^(openai|anthropic|gemini):(.+)$/.exec(id);
  return match ? { provider: match[1] as BrowserProvider, model: match[2] } : null;
}

export class BrowserAiError extends Error {
  status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}
function failure(error: unknown, provider: BrowserProvider, language: StudyLanguage): BrowserAiError {
  if (error instanceof BrowserAiError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') return new BrowserAiError(language === 'en' ? 'The request was cancelled.' : '요청이 취소되었습니다.');
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;
  const label = BROWSER_PROVIDERS[provider].label;
  const en = language === 'en';
  // 공급자 원문 오류는 요청 내용을 담을 수 있어 그대로 보여주지 않는다.
  if (status === 401 || status === 403) return new BrowserAiError(en ? `${label} rejected the API key. Check the key and its permissions.` : `${label} API 키가 올바르지 않거나 권한이 없습니다. 키를 확인해주세요.`, status);
  if (status === 429) return new BrowserAiError(en ? `${label} rate or usage limit reached. Check your ${label} console.` : `${label} 사용량 또는 요청 한도에 도달했습니다. ${label} 콘솔에서 확인해주세요.`, status);
  if (status === 400 || status === 404) return new BrowserAiError(en ? `${label} refused the request. Check the model and your billing status.` : `${label}가 요청을 거부했습니다. 모델과 결제 상태를 확인해주세요.`, status);
  return new BrowserAiError(en ? `Could not reach ${label}. Try again shortly.` : `${label}에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.`, status);
}

async function openaiClient(apiKey: string) {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true, timeout: 120_000, maxRetries: 1 });
}
async function anthropicClient(apiKey: string) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, timeout: 120_000, maxRetries: 1 });
}
async function geminiClient(apiKey: string) {
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey });
}

async function listProvider(provider: BrowserProvider, apiKey: string): Promise<BrowserModel[]> {
  const models: BrowserModel[] = [];
  if (provider === 'openai') {
    const client = await openaiClient(apiKey);
    for await (const model of client.models.list()) {
      // 대화용 텍스트 모델만 남긴다.
      if (!/^(gpt-|o\d|chatgpt-)/.test(model.id) || /audio|realtime|tts|transcribe|image|search|embedding|instruct|moderation/.test(model.id)) continue;
      models.push({ id: `openai:${model.id}`, name: model.id, provider });
    }
    models.sort((a, b) => b.name.localeCompare(a.name));
  } else if (provider === 'anthropic') {
    const client = await anthropicClient(apiKey);
    for await (const model of client.models.list({ limit: 100 })) models.push({ id: `anthropic:${model.id}`, name: model.display_name, provider });
  } else {
    const client = await geminiClient(apiKey);
    for await (const model of await client.models.list({ config: { pageSize: 100 } })) {
      const id = model.name?.replace(/^models\//, '');
      // 대화용 텍스트 모델만 남긴다.
      if (!id || !id.startsWith('gemini') || /embedding|tts|image|audio|live/.test(id) || !model.supportedActions?.includes('generateContent')) continue;
      models.push({ id: `gemini:${id}`, name: model.displayName ?? id, provider });
    }
  }
  return models;
}

export async function listBrowserModels(keys: BrowserKeys, language: StudyLanguage) {
  const providers = (Object.keys(keys) as BrowserProvider[]).filter(p => validKey(keys[p]));
  const results = await Promise.allSettled(providers.map(p => listProvider(p, keys[p]!)));
  return {
    models: results.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    errors: results.flatMap((result, i) => result.status === 'rejected' ? [failure(result.reason, providers[i], language).message] : []),
  };
}

export async function respondInBrowser({ id, keys, messages, instructions, language, signal }: { id: string; keys: BrowserKeys; messages: ChatMessage[]; instructions: string; language: StudyLanguage; signal: AbortSignal }): Promise<string> {
  const route = browserRoute(id);
  if (!route) throw new BrowserAiError('Unknown model');
  const apiKey = keys[route.provider];
  const label = BROWSER_PROVIDERS[route.provider].label;
  if (!apiKey) throw new BrowserAiError(language === 'en' ? `Add your ${label} API key first.` : `${label} API 키를 먼저 등록해주세요.`);
  try {
    let text = '';
    if (route.provider === 'openai') {
      const client = await openaiClient(apiKey);
      const response = await client.responses.create({ model: route.model, instructions, input: apiMessages(messages), store: false }, { signal });
      text = response.output_text;
    } else if (route.provider === 'anthropic') {
      const client = await anthropicClient(apiKey);
      const message = await client.messages.stream({ model: route.model, max_tokens: 32000, system: instructions, messages: apiMessages(messages) }, { signal }).finalMessage();
      if (message.stop_reason === 'refusal') throw new BrowserAiError(language === 'en' ? 'Claude declined this request. Rephrase the question and try again.' : 'Claude가 이 요청에 답하지 않았습니다. 질문을 바꿔 다시 시도해주세요.');
      text = message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('');
    } else {
      const client = await geminiClient(apiKey);
      const response = await client.models.generateContent({
        model: route.model,
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        config: { systemInstruction: instructions, abortSignal: signal },
      });
      text = response.text ?? '';
    }
    if (!text.trim()) throw new BrowserAiError(language === 'en' ? 'The reply was empty. Try again.' : '응답이 비어 있습니다. 다시 시도해주세요.');
    if (text.length > 200000) throw new BrowserAiError(language === 'en' ? 'The reply is too long. Narrow the question.' : '응답이 너무 깁니다. 질문 범위를 줄여주세요.');
    return text;
  } catch (error) { throw failure(error, route.provider, language); }
}
