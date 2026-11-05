'use client';
import { useLanguage } from '@/components/language-provider';
import { useEffect, useState } from 'react';
import { GptLogo } from '@/components/gpt-logo';
import { dateKey } from '@/lib/study';

const answer='INNER JOIN은 일치하는 행만 가져오고, LEFT JOIN은 왼쪽 테이블의 모든 행을 남겨요. 오른쪽에 일치하는 값이 없으면 NULL로 표시합니다.';
export function StudyDemo(){
  const {language,t}=useLanguage();
  const [clock,setClock]=useState(0);
  const [hidden,setHidden]=useState(true);
  const [hideError,setHideError]=useState('');
  const [hideForToday,setHideForToday]=useState(false);
  const elapsed=Math.min(clock%16000,12500);
  useEffect(()=>{try{setHidden(localStorage.getItem('study-demo-hidden-date')===dateKey());}catch{setHidden(false);}},[]);
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{setReduced(media.matches);if(media.matches)setClock(44500);};
    update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    if(hidden||reduced||clock>=44500)return;
    const timer=setInterval(()=>{if(document.visibilityState==='visible')setClock(t=>Math.min(t+80,44500));},80);
    return()=>clearInterval(timer);
  },[hidden,reduced,clock>=44500]);
  const typing=elapsed>=1600&&elapsed<5600;
  const demoAnswer=language==='en'?'INNER JOIN returns only matching rows. LEFT JOIN keeps every row from the left table, using NULL when the right table has no match.':answer;
  const text=demoAnswer.slice(0,Math.max(0,Math.floor((elapsed-1600)/4000*demoAnswer.length)));
  function closeDemo(){
    if(!hideForToday){setHidden(true);return;}
    try{localStorage.setItem('study-demo-hidden-date',dateKey());setHidden(true);}
    catch{setHideError('오늘 숨김을 저장하지 못했습니다. 닫기 버튼을 이용해주세요.');}
  }
  if(hidden)return null;
  return <div className="demo-chat" aria-label={t('대화 후 기록하기로 공부 노트를 만드는 예시')}>
    <div className="demo-top"><span className="demo-preview-mark" aria-hidden="true"><i/><i/></span><div className="demo-dismiss"><label className="demo-hide-today"><input type="checkbox" checked={hideForToday} onChange={e=>setHideForToday(e.target.checked)}/>{t('오늘 하루 그만 보기')}</label><button className="demo-close" aria-label={t('예시 닫기')} title={t('닫기')} onClick={closeDemo}>×</button></div></div>
    {hideError&&<p className="demo-hide-error" role="alert">{hideError}</p>}
    <div className="demo-stage" aria-live="off">
      <div aria-hidden={elapsed<400} className={`demo-question ${elapsed>=400?'shown':''}`}><p>{language==='en'?'How do INNER JOIN and LEFT JOIN differ?':'INNER JOIN과 LEFT JOIN은 어떻게 달라?'}</p></div>
      <div aria-hidden={elapsed<1200} className={`demo-answer ${elapsed>=1200?'shown':''}`}><span className="demo-gpt-icon"><GptLogo/></span><div>{elapsed<1600?<span className="demo-dots" aria-label={t('답변 준비 중')}><i/><i/><i/></span>:<p>{text}{typing&&<span className="demo-caret" aria-hidden="true"/>}</p>}</div></div>
      <div aria-hidden={elapsed<6500} className={`demo-question follow-up ${elapsed>=6500?'shown':''}`}><p>{language==='en'?'So LEFT JOIN also shows members without orders.':'주문하지 않은 회원도 보려면 LEFT JOIN이겠네.'}</p></div>
      <div aria-hidden={elapsed<7800} className={`demo-answer follow-up ${elapsed>=7800?'shown':''}`}><span className="demo-gpt-icon"><GptLogo/></span><p>{language==='en'?'Exactly. Put members on the left to keep those without orders.':'맞아요. 회원 테이블을 왼쪽에 두면 주문이 없는 회원도 결과에 남아요.'}</p></div>
      <div aria-hidden={elapsed<9200} className={`demo-record ${elapsed>=9200?'shown':''}`}><span className={`demo-record-button ${elapsed>=10000?'pressed':''}`}>{elapsed>=11500?(language==='en'?'Recorded ✓':'기록 완료 ✓'):elapsed>=10000?t('요약 중…'):t('기록하기')}</span></div>
      <div aria-hidden={elapsed<11500} className={`demo-note ${elapsed>=11500?'shown':''}`}><div><span>{t('공부 노트')}</span><span className="demo-note-check">✓</span></div><h3>{language==='en'?'Understanding JOINs':'JOIN의 차이 이해하기'}</h3><p>{language==='en'?'Use INNER JOIN for matches only, or LEFT JOIN to keep every row on the left.':<>일치하는 행만 필요하면 INNER JOIN,<br/>왼쪽 데이터를 모두 남기려면 LEFT JOIN.</>}</p><div className="demo-note-bottom"><span>{t('공부 달력에 기록됨')}</span><span>.md</span></div></div>
    </div>
  </div>;
}
