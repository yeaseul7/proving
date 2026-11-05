import type { AiVendor } from '@/lib/chat';
import { GptLogo } from '@/components/gpt-logo';

// 답변을 만든 공급자 표시. provider가 없는 이전 답변은 모두 GPT로 만든 것이다.
const CLAUDE_RAYS = Array.from({ length: 12 }, (_, i) => ({ angle: i * 30, length: i % 2 ? 7.2 : 9.6 }));

export function AiLogo({ provider }: { provider?: AiVendor }) {
  if (provider === 'anthropic') return <svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label="Claude" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    {CLAUDE_RAYS.map(({ angle, length }) => <line key={angle} x1="12" y1="12" x2={12 + length * Math.sin(angle * Math.PI / 180)} y2={12 - length * Math.cos(angle * Math.PI / 180)} />)}
  </svg>;
  if (provider === 'gemini') return <svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label="Gemini" fill="currentColor">
    <path d="M12 1.5C12.6 7 17 11.4 22.5 12 17 12.6 12.6 17 12 22.5 11.4 17 7 12.6 1.5 12 7 11.4 11.4 7 12 1.5Z" />
  </svg>;
  return <GptLogo />;
}
