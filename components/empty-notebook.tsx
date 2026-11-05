export function EmptyNotebook(){
  return <svg className="empty-notebook" width="120" height="104" viewBox="0 0 120 104" fill="none" aria-hidden="true">
    <rect x="27" y="17" width="69" height="77" rx="6" fill="var(--color-accent-soft)"/>
    <rect x="23" y="11" width="69" height="77" rx="6" fill="var(--color-paper)" stroke="var(--color-accent-border)" strokeWidth="1.4"/>
    <path d="M36 12v75M46 34h31M46 46h31M46 58h23" stroke="var(--color-accent-border)" strokeOpacity=".6" strokeLinecap="round"/>
    {[24,39,54,69].map(y=><path key={y} d={`M28 ${y}h-9a3 3 0 0 0 0 6h9`} stroke="var(--color-text-subtle)" strokeWidth="1.5" strokeLinecap="round"/>)}
    <path d="m98 15 2-5m3 12 5-1M10 76l-4 2" stroke="var(--color-accent-border)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}
