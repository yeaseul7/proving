export function RecordingLoader({english=false}:{english?:boolean}){
  return <div className="recording-overlay" role="status" aria-live="polite">
    <div className="recording-loader">
      <svg className="recording-illustration" viewBox="0 0 160 120" fill="none" aria-hidden="true">
        <rect x="25" y="30" width="104" height="76" rx="9" fill="var(--color-paper)" stroke="var(--color-accent-border)" strokeWidth="2"/>
        <path d="M40 50H112M40 67H112M40 84H112" stroke="var(--color-accent-soft-hover)" strokeWidth="2" strokeLinecap="round"/>
        <path className="recording-ink" d="M41 64q5-9 9-2t9-1 9 1 9-1 9 1" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" pathLength="1"/>
        <g className="recording-pencil">
          <g transform="translate(83 63) rotate(32)">
            <path d="M-7-49V-7L0 4 7-7V-49Z" fill="#f5cf70" stroke="#96764a" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M-7-7 0 4 7-7" fill="#f5e4bf" stroke="#96764a" strokeWidth="1.5"/>
            <path d="m-2 1 2 3 2-3" fill="var(--color-text)"/>
            <path d="M0-44V-12" stroke="#fff3c6" strokeWidth="3" strokeLinecap="round"/>
            <path d="M-7-49v-7a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v7Z" fill="#e9a9a4" stroke="#96764a" strokeWidth="1.5"/>
            <path d="M-7-49H7" stroke="#96764a" strokeWidth="3"/>
          </g>
        </g>
      </svg>
      <strong>{english?'Saving your notes':'기록 중'}<span className="recording-dots" aria-hidden="true">…</span></strong>
      <p>{english?'Gathering what you learned.':'배운 내용을 차곡차곡 담고 있어요.'}</p>
    </div>
  </div>;
}
