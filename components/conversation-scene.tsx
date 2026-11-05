'use client';
import { useEffect, useState } from 'react';
import type { Message, Speaker } from '@/lib/dialogue';

const COLORS = ['#F5E39A', '#BDD5E6', '#DCE9CF', '#E8CED5'];
function StickFigure({ active, index, playing }: { active: boolean; index: number; playing: boolean }) {
  return <svg viewBox="0 0 120 170" fill="none" aria-hidden="true" className={`stick-figure ${active && playing ? 'speaking' : ''}`}>
    <g stroke="#252525" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="60" cy="161" rx="32" ry="3" fill="#F0EFE9" stroke="none"/>
      <path d="M48 68q-12 16-13 44l49 1q-1-27-13-44" fill={COLORS[index % COLORS.length]} stroke="none"/>
      <path d="M49 69q-14 16-14 43l49 1q-2-29-14-44M47 113l-6 43-12 2m41-45 9 43 12 1"/>
      <g className="figure-arm"><path d={index % 2 ? 'M78 82l17 17 13-23' : 'M41 82 25 97 11 78'}/></g>
      <path d={index % 2 ? 'M41 82 25 97 12 90' : 'M78 82l16 14 12-7'}/>
      <path d="M80 35C77 9 43 6 36 32c-6 22 7 39 25 38 20-1 26-18 19-35Z" fill="white"/>
      {index % 2 ? <path d="M36 30q3-25 25-18 14-1 19 16"/> : <path d="m37 29-5-7 9 1 2-10 7 4 7-9 6 9 10-2 1 10"/>}
      <path d="m48 39 1 1m20-1 1 1"/>
      {active ? <ellipse className="figure-mouth" cx="59" cy="53" rx="5" ry="4" fill="#252525" stroke="none"/> : <path d="M52 53q7 5 14-1"/>}
      {active && <g stroke="#C4AB4B"><path d="m91 36 9-5m-7 17 10 1m-15-24 3-8"/></g>}
    </g>
  </svg>;
}
export function ConversationScene({ speakers, messages, autoPlay = false }: { speakers: Speaker[]; messages: Message[]; autoPlay?: boolean }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  useEffect(() => { setIndex(0); setPlaying(autoPlay); }, [messages, autoPlay]);
  const current = messages[Math.min(index, messages.length - 1)];
  useEffect(() => {
    if (!playing || !current) return;
    const timer = setTimeout(() => {
      if (index + 1 < messages.length) setIndex(index + 1);
      else if (autoPlay) setIndex(0);
      else setPlaying(false);
    }, Math.min(7000, Math.max(2200, current.displayText.length * 110)));
    return () => clearTimeout(timer);
  }, [playing, current, index, messages.length, autoPlay]);
  const speaker = speakers.find(s => s.id === current?.speakerId);
  const activeIndex = speakers.findIndex(s => s.id === current?.speakerId);
  return <div className="conversation-scene">
    <div className="scene-heading"><span>대화 한 장면</span><span>{speakers.length}명의 이야기</span></div>
    <div className="scene-dialogue" aria-live={playing ? 'off' : 'polite'}>
      {current ? <><div className="scene-speaker"><span style={{ background: COLORS[Math.max(0, activeIndex)] }}/>{speaker?.name || '이름 없음'}{current.timestamp && <time>{current.timestamp}</time>}</div>
        <div className="scene-bubble" key={current.id + index} style={{ '--speaker-color': COLORS[Math.max(0, activeIndex)] } as React.CSSProperties}>{current.displayText || '…'}<span className="bubble-tail"/></div></> : <p className="scene-empty">대사를 추가하면 캐릭터가 이야기를 시작해요.</p>}
    </div>
    <div className="scene-cast" style={{ '--cast-count': Math.max(1, speakers.length) } as React.CSSProperties}>
      {speakers.map((s, i) => <div key={s.id} className={`scene-character ${current?.speakerId === s.id ? 'is-active' : ''}`}>
        <StickFigure active={current?.speakerId === s.id} index={i} playing={playing}/><span className="character-name">{s.name || '이름 없음'}</span><span className="character-state">{current?.speakerId === s.id ? playing ? '이야기하는 중' : '지금 대사' : '듣는 중'}</span>
      </div>)}
    </div>
    <div className="scene-controls"><button disabled={!messages.length || index === 0} aria-label="이전 대사" onClick={() => setIndex(Math.max(0, index - 1))}>←</button><button className="scene-play" disabled={!messages.length} aria-label={playing ? '대화 미리보기 일시정지' : '대화 미리보기 재생'} onClick={() => { if (!playing && index === messages.length - 1) setIndex(0); setPlaying(!playing); }}>{playing ? 'Ⅱ' : '▷'}</button><button disabled={!messages.length || index >= messages.length - 1} aria-label="다음 대사" onClick={() => setIndex(Math.min(messages.length - 1, index + 1))}>→</button><span>{messages.length ? index + 1 : 0} / {messages.length}</span><small>음성 없음</small></div>
  </div>;
}
