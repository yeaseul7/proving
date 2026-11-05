'use client';
import { useLanguage } from '@/components/language-provider';
import { dateKey, type StudyNote } from '@/lib/study';

function RawEgg(){
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 3C10 3 5.5 14 5.5 20a10.5 9 0 0 0 21 0C26.5 14 22 3 16 3Z" fill="#eee0c5" stroke="#c7b697" strokeWidth="1.3"/><path d="M12 9c-1.8 2.6-3 6-3.2 8.5" stroke="#fff8e9" strokeWidth="2" strokeLinecap="round"/></svg>;
}
function FriedEgg({level=2}:{level?:number}){
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8.4 5.8c3-2.7 5.8-.4 8.1-1.1 4.1-1.4 8.7 1.6 8.7 5.7 0 2.6 3.6 3.9 3 7.6-.6 3.8-4.5 4.1-6 6.8-1.9 3.4-6 2.2-8.6 2.5-3.9.4-4.8-3.3-7.6-4.6-4.3-2-3.9-6.7-1.8-9.1C6 11.5 5.3 8.6 8.4 5.8Z" fill="#fffdf3" stroke="#d6cbb0" strokeWidth="1.2"/><ellipse cx="16.5" cy="15.8" rx="6.3" ry="6.1" fill={level>=3?'#e59d24':'#f5cd59'}/><path d="M13.2 13.3c.7-1.1 1.9-1.6 3.1-1.6" stroke="#fff1b1" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}
// 하루 기록 개수: 1개 날계란(적게), 2개 연한 노랑(보통), 3개 이상 진한 주황(많이).
function EggForCount({count}:{count:number}){
  return count===1?<RawEgg/>:<FriedEgg level={Math.min(count,3)}/>;
}
const legendLevels=[
  {count:1,ko:'적게',en:'Few',koHint:'하루 1개',enHint:'1 note a day'},
  {count:2,ko:'보통',en:'Some',koHint:'하루 2개',enHint:'2 notes a day'},
  {count:3,ko:'많이',en:'Many',koHint:'하루 3개 이상',enHint:'3+ notes a day'},
];
// onSelect가 없으면 공개 프로필용 읽기 전용 그래프로 그린다.
export function EggGarden({notes=[],counts:dayCounts,today,selected=null,onSelect}:{notes?:StudyNote[];counts?:Record<string,number>;today:string;selected?:string|null;onSelect?:(day:string|null)=>void}){
  const {language}=useLanguage();
  const en=language==='en';
  if(!today)return <div className="egg-loading">{en?'Loading study history…':'공부 기록을 불러오는 중'}</div>;
  const end=new Date(`${today}T12:00:00`);
  const first=new Date(end);first.setFullYear(first.getFullYear()-1);first.setDate(first.getDate()+1);
  const start=new Date(first);start.setDate(start.getDate()-start.getDay());
  const cells:{date:string;count:number;future:boolean;outside:boolean}[]=[];
  const counts=new Map<string,number>(dayCounts?Object.entries(dayCounts):[]);if(!dayCounts)for(const note of notes)counts.set(note.date,(counts.get(note.date)??0)+1);
  const cursor=new Date(start);
  do{const date=dateKey(cursor);cells.push({date,count:counts.get(date)??0,future:date>today,outside:cursor<first});cursor.setDate(cursor.getDate()+1);}while(cursor<=end||cursor.getDay()!==0);
  const weeks=cells.length/7;
  const labels=Array.from({length:weeks},(_,i)=>{const day=new Date(`${cells[i*7].date}T12:00:00`);return i===0||day.getDate()<=7?(en?day.toLocaleDateString('en-US',{month:'short'}):String(day.getMonth()+1)):'';});
  return <section className="egg-garden" aria-label={en?'Study history for the past year':'최근 1년 공부 기록'}>
    
    <div className="egg-chart"><div className="egg-month-axis"><div className="egg-months" style={{gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`}}>{labels.map((label,i)=><span key={i}>{label}</span>)}</div>{!en&&<span className="egg-month-unit">월</span>}</div><div className="egg-body"><div className="egg-weekdays" aria-hidden="true">{['',en?'Mon':'월','',en?'Wed':'수','',en?'Fri':'금',''].map((label,i)=><span key={i}>{label}</span>)}</div><div className="egg-grid" style={{gridTemplateColumns:`repeat(${weeks},minmax(0,1fr))`,aspectRatio:`${weeks} / 7`}}>{cells.map(cell=>{const label=en?`${cell.date} · ${cell.count} study notes`:`${cell.date} · 공부 기록 ${cell.count}개`;return cell.future||cell.outside?<span className="egg-cell outside" key={cell.date}/>:!onSelect?<span key={cell.date} role="img" className={`egg-cell ${cell.count?'cooked':'uncooked'}`} title={label} aria-label={label}>{cell.count?<EggForCount count={cell.count}/>:<span/>}</span>:<button key={cell.date} className={`egg-cell ${cell.count?'cooked':'uncooked'} ${selected===cell.date?'selected':''}`} title={label} aria-label={label} aria-pressed={selected===cell.date} onClick={()=>onSelect(selected===cell.date?null:cell.date)}>{cell.count?<EggForCount count={cell.count}/>:<span/>}</button>})}</div></div></div>
    <div className="egg-legend"><div>{legendLevels.map(({count,ko,en:enLabel,koHint,enHint})=><span className="legend-item" key={count} title={en?enHint:koHint}><span className="legend-egg"><EggForCount count={count}/></span>{en?enLabel:ko}</span>)}</div></div>
  </section>;
}
