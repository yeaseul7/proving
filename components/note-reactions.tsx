import { useState } from 'react';

const reactions = [
  { value: 'like', ko: '좋아요', en: 'Like' },
  { value: 'disappointed', ko: '아쉬워요', en: 'Could be better' },
] as const;

type Reaction = (typeof reactions)[number]['value'];

export function NoteReactions({ noteId, language }: { noteId: string; language: 'ko' | 'en' }) {
  const storageKey = `proving-note-reaction:${noteId}`;
  const [selected, setSelected] = useState<Reaction | null>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === 'like' || saved === 'disappointed' ? saved : null;
    } catch {
      return null;
    }
  });

  function toggle(reaction: Reaction) {
    const next = selected === reaction ? null : reaction;
    setSelected(next);
    try {
      if (next) localStorage.setItem(storageKey, next);
      else localStorage.removeItem(storageKey);
    } catch {
      // Keep the selection for this view if browser storage is unavailable.
    }
  }

  return (
    <div className="note-reactions" role="group" aria-label={language === 'ko' ? '노트 반응' : 'Note reactions'}>
      {reactions.map(reaction => (
        <button
          key={reaction.value}
          type="button"
          className="button secondary"
          aria-pressed={selected === reaction.value}
          onClick={() => toggle(reaction.value)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {reaction.value === 'like' ? (
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>
            ) : (
              <>
                <circle cx="12" cy="12" r="9"/>
                <path d="M8 16a4.5 4.5 0 0 1 8 0M9 9h.01M15 9h.01"/>
              </>
            )}
          </svg>
          {reaction[language]}
        </button>
      ))}
    </div>
  );
}
