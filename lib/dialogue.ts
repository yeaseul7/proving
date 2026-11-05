export type Speaker = { id: string; name: string; voice: string; rate: number };
export type Message = { id: string; speakerId: string; displayText: string; speechText: string | null; review: boolean; timestamp?: string };
export type Project = { id: string; title: string; rawText?: string; speakers: Speaker[]; messages: Message[]; updatedAt: string };
export const EXAMPLE = '나: 야 오늘 뭐해?\n친구: 나 집인데 왜?\n나: 날씨 좋은데 산책 갈래?\n친구: 좋아! 커피도 한 잔 하자 ☕';
export function parseDialogue(input: string): { speakers: Speaker[]; messages: Message[]; error?: string } {
  const speakers: Speaker[] = []; const messages: Message[] = [];
  for (const raw of input.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim(); if (!line) continue;
    // Timestamped chat exports must be parsed before the colon-delimited format.
    const timed = /^(오전|오후)\s+(0?[1-9]|1[0-2]):([0-5]\d)\s+(.+)$/.exec(line);
    let timestamp: string | undefined;
    let inferred = false;
    let match: string[] | null = /^([^:：]{1,30})[:：]\s*(.*)$/.exec(line);
    if (timed) {
      timestamp = `${timed[1]} ${timed[2]}:${timed[3]}`;
      const body = timed[4];
      // Numeric group prefixes (e.g. “92 치타빠”) belong to the name.
      const explicit = /^([^:：]{1,30})[:：]\s*(.*)$/.exec(body);
      const parts = /^(\d{2}\s+\S+|\S+)(?:\s+(.*))?$/.exec(body)!;
      match = explicit ?? [body, parts[1], parts[2] ?? ''];
      // Whitespace alone cannot unambiguously delimit arbitrary display names.
      inferred = !explicit;
    }
    if (match) {
      const name = match[1].trim();
      let speaker = speakers.find(s => s.name === name);
      if (!speaker) {
        if (speakers.length === 4) return { speakers: [], messages: [], error: '화자는 최대 4명까지 사용할 수 있어요. 이름을 합치거나 수정해주세요.' };
        speaker = { id: `speaker-${speakers.length + 1}`, name, voice: '기본 목소리', rate: 1 }; speakers.push(speaker);
      }
      messages.push({ id: `message-${messages.length + 1}`, speakerId: speaker.id, displayText: match[2], speechText: null, review: inferred || !match[2], ...(timestamp ? { timestamp } : {}) });
    } else if (messages.length) {
      messages[messages.length - 1].displayText += '\n' + line;
    } else {
      speakers.push({ id: 'speaker-1', name: '화자 1', voice: '기본 목소리', rate: 1 });
      messages.push({ id: 'message-1', speakerId: 'speaker-1', displayText: line, speechText: null, review: true });
    }
  }
  return { speakers, messages, ...(!messages.length ? { error: '먼저 대화를 입력해주세요.' } : {}) };
}
export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const p = value as Project;
  return typeof p.id === 'string' && typeof p.title === 'string' && (p.rawText === undefined || typeof p.rawText === 'string') && typeof p.updatedAt === 'string' && Array.isArray(p.speakers) && p.speakers.length > 0 && p.speakers.length <= 4 && p.speakers.every(s => typeof s.id === 'string' && typeof s.name === 'string' && typeof s.voice === 'string' && typeof s.rate === 'number') && Array.isArray(p.messages) && p.messages.every(m => typeof m.id === 'string' && p.speakers.some(s => s.id === m.speakerId) && typeof m.displayText === 'string' && (m.speechText === null || typeof m.speechText === 'string') && typeof m.review === 'boolean' && (m.timestamp === undefined || typeof m.timestamp === 'string'));
}
