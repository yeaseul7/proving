'use client';
import { parseDialogue, type Project } from '@/lib/dialogue';

export function TextEditor({ project, onChange }: { project: Project; onChange: (project: Project) => void }) {
  const value = project.rawText ?? project.messages.map(m => `${m.timestamp ? m.timestamp + ' ' : ''}${project.speakers.find(s => s.id === m.speakerId)?.name}: ${m.displayText}`).join('\n');
  const parsed = parseDialogue(value);
  function edit(text: string) {
    const result = parseDialogue(text);
    if (result.error) {
      onChange({ ...project, rawText: text, ...(text.trim() ? {} : { messages: [] }) });
      return;
    }
    const speakers = result.speakers.map(s => {
      const previous = project.speakers.find(old => old.name === s.name);
      return previous ? { ...s, id: previous.id, voice: previous.voice, rate: previous.rate } : { ...s, id: crypto.randomUUID() };
    });
    const used = new Set<string>();
    const messages = result.messages.map(m => {
      const name = result.speakers.find(s => s.id === m.speakerId)!.name;
      const speakerId = speakers.find(s => s.name === name)!.id;
      const previous = project.messages.find(old => !used.has(old.id) && old.speakerId === speakerId && old.displayText === m.displayText && old.timestamp === m.timestamp);
      if (previous) used.add(previous.id);
      return { ...m, speakerId, id: previous?.id ?? crypto.randomUUID(), speechText: previous?.speechText ?? null };
    });
    onChange({ ...project, rawText: text, speakers, messages });
  }
  return <div className="plain-text-editor"><div className="panel-heading"><h2>텍스트 수정</h2><span className="muted">{project.speakers.length}명 · {project.messages.length}개 대사</span></div><p className="helper">전체 대화를 여기서 바로 수정하세요. 줄을 추가하거나 지우면 미리보기도 바뀌어요.</p><label htmlFor="conversation-text" className="sr-only">전체 대화 텍스트</label><textarea id="conversation-text" spellCheck={false} value={value} placeholder={'나: 오늘 뭐해?\n친구: 산책 갈래?'} onChange={e => edit(e.target.value)} aria-invalid={!!parsed.error && !!value.trim()} aria-describedby="text-edit-help"/><div className="text-editor-meta"><span>{value.length.toLocaleString()}자</span><span>자동 저장</span></div><p id="text-edit-help" className={parsed.error && value.trim() ? 'error' : 'helper'} role="status">{parsed.error && value.trim() ? `${parsed.error} 입력한 텍스트는 그대로 저장돼요.` : '화자: 대사 또는 시간·이름이 포함된 대화를 사용할 수 있어요.'}</p></div>;
}
