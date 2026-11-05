'use client';
import Image from 'next/image';
import { useLanguage } from '@/components/language-provider';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { dateKey, isStudyNote, markdown, transcript, STORAGE_KEY, streak, type StudyNote } from '@/lib/study';

import { NoteDownload } from '@/components/note-download';
import { EmptyNotebook } from '@/components/empty-notebook';
import { EggGarden } from '@/components/egg-garden';
import { ProfileEditor } from '@/components/profile-editor';
import { DeviceLinks } from '@/components/device-links';
import { StudyMarkdown } from '@/components/study-markdown';
import { writeStudy, type StoredStudyNote } from '@/lib/study-sync-client';
import { StudyChat, type Account } from '@/components/study-chat';

type View = 'home' | 'notes' | 'connect';
const homeLimit = 3;
type FontMode = 'readable' | 'handwriting';
const fontModesStorageKey = 'proving-font-modes';
const fontModes: FontMode[] = ['readable', 'handwriting'];
function Icon({name, size=20}: {name: string; size?: number}) {
  if(name==='egg')return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 6c3-3 6 0 9-1 5-2 9 2 8 6-1 3 5 5 3 9-2 4-5 3-7 6-3 3-6 0-9 1-4 0-5-4-8-6-3-4 1-6 1-9 0-3 1-5 3-6Z" fill="#fffaf0" stroke="#b7aa8b" strokeWidth="1.4"/><circle cx="16" cy="16" r="6" fill="#eebd45"/><path d="M13 13c1-1 2-1.5 3-1.5" stroke="#fff1b1" strokeWidth="1.2" strokeLinecap="round"/></svg>;
  const paths: Record<string, React.ReactNode> = {
    chat: <><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z"/><path d="M8 8h8M8 12h5"/></>,
    books: <><path d="M3 4h5v16H3zM8 6h5v14H8zM14 5l5-1 3 15-5 1Z"/><path d="M3 8h5M8 10h5m2-1 5-1M3 17h10m4-1 4-1"/></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></>,
    book: <><path d="M12 5v16M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/></>,
    link: <><path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0M16 9l2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0" transform="translate(0 -1) scale(.95)"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    leaf: <><path d="M20 3C8 2 2 7 5 15c8 5 15-2 15-12Z"/><path d="M3 21 15 9"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.book}</svg>;
}
const emptyDraft = (date: string) => ({title:'', date, subject:'',  content:''});
export default function Home() {
  const {language,setLanguage,t}=useLanguage();
  const [view,setView]=useState<View>('connect');
  const [viewFontModes, setViewFontModes] = useState<Partial<Record<View, FontMode>>>({});
  const fontMode = viewFontModes[view] ?? 'handwriting';
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(fontModesStorageKey) ?? '{}');
      const next: Partial<Record<View, FontMode>> = {};
      for (const screen of ['connect', 'home', 'notes'] as const) {
        if (fontModes.includes(stored?.[screen])) next[screen] = stored[screen];
      }
      setViewFontModes(next);
    } catch { /* 브라우저 설정을 읽을 수 없으면 기본 글꼴을 사용한다. */ }
  }, []);

  function selectFontMode(mode: FontMode) {
    const next = { ...viewFontModes, [view]: mode };
    setViewFontModes(next);
    try { localStorage.setItem(fontModesStorageKey, JSON.stringify(next)); } catch {}
  }
  const [notes,setNotes]=useState<StudyNote[]>([]);
  const [ready,setReady]=useState(false);
  const [recordBusy,setRecordBusy]=useState(false);
  const onRecordsLoaded=useCallback((records:StoredStudyNote[], ownerId:string)=>{
    setNotes(previous=>[
      ...records.map(record=>{
        const local=previous.find(note=>note.id===record.id);
        return {...record, ownerId, views:local?.views, comments:local?.comments};
      }),
      ...previous.filter(note=>!note.cloud && !records.some(record=>record.id===note.id)),
    ]);
  },[]);
  const [storageKey,setStorageKey]=useState(STORAGE_KEY);
  const [signedIn,setSignedIn]=useState(false);
  const [accountName,setAccountName]=useState('');
  const [accountId,setAccountId]=useState<string|null>(null);
  const [comment,setComment]=useState('');
  const onAccount=useCallback((account:Account|null)=>{
    setSignedIn(Boolean(account));setAccountId(account?.account??null);setAccountName(account?.name??'');
    if(!account)setView('connect');
    setStorageKey(account?`${STORAGE_KEY}-${account.account}`:STORAGE_KEY);
  },[]);
  const [today,setToday]=useState('');
  const [month,setMonth]=useState(new Date(2026,10,1));
  const [selectedDay,setSelectedDay]=useState<string|null>(null);
  const [search,setSearch]=useState('');
  const [sortBy,setSortBy]=useState<'latest'|'comments'|'views'>('latest');
  const [subject,setSubject]=useState('전체');
  const [editing,setEditing]=useState<string|null>(null);
  const [editor,setEditor]=useState(false);
  const [draft,setDraft]=useState(emptyDraft(''));
  const [detail,setDetail]=useState<StudyNote|null>(null);
  const [resume,setResume]=useState<{key:string;note:StudyNote}|null>(null);
  const [,setNotice]=useState('');
  const [detailView,setDetailView]=useState<'summary'|'original'>('summary');
  const [detailNotice,setDetailNotice]=useState('');
  useEffect(()=>{setDetailView('summary');setDetailNotice('');setComment('');},[detail?.id]);
  const [storageError,setStorageError]=useState(false);
  const dialogRef=useRef<HTMLDialogElement>(null);
  const detailRef=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    setReady(false);setStorageError(false);
    const now=new Date();setToday(dateKey(now));setMonth(new Date(now.getFullYear(),now.getMonth(),1));
    try { const raw=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(raw)||!raw.every(isStudyNote))throw new Error();setNotes(raw.map(note=>({...note,ownerId:note.ownerId??(storageKey.startsWith(`${STORAGE_KEY}-`)?storageKey.slice(STORAGE_KEY.length+1):undefined)}))); }
    catch {setNotes([]);setStorageError(true);setNotice('기존 기록을 읽지 못했습니다. 저장 공간을 확인한 뒤 새로고침해주세요.');}
    setReady(true);
    const timer=setInterval(()=>setToday(dateKey()),30000);return()=>clearInterval(timer);
  },[storageKey]);
  useEffect(()=>{if(editor)dialogRef.current?.showModal();else dialogRef.current?.close();},[editor]);
  useEffect(()=>{if(detail)detailRef.current?.showModal();else detailRef.current?.close();},[detail]);
  function persist(next: StudyNote[]) {
    if(storageError){setNotice('기존 기록 보호를 위해 저장이 중지되었습니다. 저장 공간을 확인한 뒤 새로고침해주세요.');return false;}
    try {localStorage.setItem(storageKey,JSON.stringify(next.map(note=>note.cloud?{...note,messages:undefined}:note)));setNotes(next);return true;}
    catch {setNotice('저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요.');return false;}
  }
  function openDetail(note:StudyNote){
    const next={...note,views:(note.views??0)+1};
    if(persist(notes.map(n=>n.id===note.id?next:n))||note.cloud)setDetail(next);
  }
  function addComment(e:FormEvent){
    e.preventDefault();if(!detail||!comment.trim())return;
    const next={...detail,comments:[...(detail.comments??[]),{id:crypto.randomUUID(),author:accountName,content:comment.trim(),createdAt:new Date().toISOString()}]};
    if(persist(notes.map(n=>n.id===next.id?next:n))){setDetail(next);setComment('');}
  }
  function removeComment(id:string){
    if(!detail)return;
    const next={...detail,comments:(detail.comments??[]).filter(c=>c.id!==id)};
    if(persist(notes.map(n=>n.id===next.id?next:n)))setDetail(next);
  }
  function openEditor(note?: StudyNote){setDetail(null);setEditing(note?.id??null);setDraft(note?{title:note.title,date:note.date,subject:note.subject,content:note.content}:emptyDraft(today));setEditor(true);}
  async function save(e:FormEvent){
    e.preventDefault();
    if(recordBusy||!draft.title.trim()||!draft.content.trim())return;
    const note:StudyNote={...notes.find(note=>note.id===editing),...draft,title:draft.title.trim(),subject:draft.subject.trim()||'기타',id:editing||crypto.randomUUID(),updatedAt:new Date().toISOString(),ownerId:accountId??undefined};
    setRecordBusy(true);
    try {
      if (note.cloud && accountId) await writeStudy(accountId, {action:'edit-record',note});
      if (note.cloud) {
        setNotes(previous=>[note,...previous.filter(item=>item.id!==note.id)]);
        setEditor(false);
      } else if(persist([note,...notes.filter(item=>item.id!==note.id)])) setEditor(false);
    } catch(error) {
      setDetailNotice(error instanceof Error?error.message:'기록을 수정하지 못했습니다.');
    } finally { setRecordBusy(false); }
  }
  async function removeRecord(note:StudyNote, originalOnly:boolean) {
    if (!accountId || note.ownerId!==accountId || recordBusy) return;
    const message = originalOnly
      ? (language==='en'?'Delete the original conversation? The summary will remain.':'원본 대화를 삭제할까요? 공부 요약은 남습니다.')
      : (language==='en'?'Delete this note?':'이 노트를 삭제할까요?');
    if(!confirm(message))return;
    setRecordBusy(true);
    try {
      if(note.cloud) await writeStudy(accountId,{action:originalOnly?'delete-original':'delete-record',id:note.id});
      const updated={...note,messages:undefined};
      const next=originalOnly?notes.map(item=>item.id===note.id?updated:item):notes.filter(item=>item.id!==note.id);
      const persisted=persist(next);
      if(persisted||note.cloud){
        if(!persisted)setNotes(next);
        setDetail(originalOnly?updated:null);
        if(originalOnly)setDetailNotice(language==='en'?'Original conversation deleted.':'원본 대화를 삭제했습니다.');
      }
    } catch(error) {
      setDetailNotice(error instanceof Error?error.message:'기록을 삭제하지 못했습니다.');
    } finally { setRecordBusy(false); }
  }

  function download(note:StudyNote){const url=URL.createObjectURL(new Blob([markdown(note,language)],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${note.date}-${note.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Markdown 파일을 내려받았어요.');}
  function downloadOriginal(note:StudyNote){
    if(!accountId||note.ownerId!==accountId||!note.messages?.length)return;
    const url=URL.createObjectURL(new Blob([transcript(note,language)],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`${note.date}-${note.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')}-${language==='en'?'conversation':'원본대화'}.txt`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);setDetailNotice(t('원본 대화를 TXT로 내려받았습니다.'));
  }
  async function copyOriginal(note:StudyNote){
    if(!accountId||note.ownerId!==accountId||!note.messages?.length)return;
    try{await navigator.clipboard.writeText(transcript(note,language));setDetailNotice(t('원본 대화를 복사했습니다.'));}
    catch{setDetailNotice(t('복사하지 못했습니다. 아래 텍스트를 선택해 복사하거나 TXT로 내려받아주세요.'));}
  }
  const sorted=[...notes].sort((a,b)=>{
    const rank=view==='notes'&&sortBy==='comments'?(b.comments?.length??0)-(a.comments?.length??0):view==='notes'&&sortBy==='views'?(b.views??0)-(a.views??0):0;
    return rank||b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt);
  });
  const monthPrefix=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
  const monthNotes=notes.filter(n=>n.date.startsWith(monthPrefix));
  const daysStudied=new Set(monthNotes.map(n=>n.date)).size;
  const filtered=sorted.filter(n=>(subject==='전체'||n.subject===subject)&&(!selectedDay||n.date===selectedDay)&&`${n.title} ${n.content} ${n.subject}`.toLowerCase().includes(search.toLowerCase()));
  // 개요는 최근(또는 선택한 날짜의) 노트 3개만 보여주고 나머지는 기록 화면에서 본다.
  function showMore(){setView('notes');setSearch('');setSubject('전체');}
  function changeView(next:View){if(next!=='connect'&&!signedIn)return;setView(next);setSelectedDay(null);setSearch('');setSubject('전체');}
  const ownsDetail=Boolean(accountId&&detail?.ownerId===accountId);
  return <div className={`app-shell ${view==='connect'?'study-layout':''}`} data-font-mode={fontMode}>
    <aside className="sidebar"><a className="brand" href="/" aria-label={t('proving 홈')}><Image src="/proving-logo.png" alt="Proving" width={1630} height={526} sizes="140px" className="brand-logo" /></a><nav aria-label={t('메인 메뉴')}>{([{id:'connect',icon:'chat',label:t('배우는 중')},{id:'home',icon:'egg',label:t('개요')},{id:'notes',icon:'books',label:t('기록')}] as const).filter(item=>signedIn||item.id==='connect').map(item=><button key={item.id} className={view===item.id?'nav-item active':'nav-item'} onClick={()=>changeView(item.id)}><Icon name={item.icon}/>{item.label}{item.id==='notes'&&<span className="nav-count">{notes.length}</span>}</button>)}</nav><div className="sidebar-bottom">
      <div className="sidebar-preferences">
        <div className="language-switch font-mode-switch" data-font-mode={fontMode} role="group" aria-label={language==='ko'?'이 화면의 글꼴 모드':'Font mode for this screen'}>
          {fontModes.map(mode=>(
            <label key={mode}>
              <input type="radio" name="font-mode" value={mode} checked={fontMode===mode} onChange={()=>selectFontMode(mode)} />
              <span>{mode==='readable'?(language==='ko'?'가독성 모드':'Reading'):(language==='ko'?'필기 모드':'Handwriting')}</span>
            </label>
          ))}
        </div>
        <div className="language-switch" data-language={language} role="group" aria-label={language==='ko'?'언어 선택':'Language'}>
          <button aria-pressed={language==='ko'} onClick={()=>setLanguage('ko')}>한국어</button>
          <button aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>English</button>
        </div>
      </div>
      <div id="sidebar-account"/>
    </div></aside>
    <div className="main-shell">
    <main>
    {signedIn&&view==='home'&&<>
      <section className="stats" aria-label={t('공부 통계')}>
        <article><p>{language==='ko'?'연속':'Streak'}</p><strong>{today?streak(notes,today):0}<small>{language==='ko'?'일':today&&streak(notes,today)===1?'day':'days'}</small></strong></article>
        <article><p>{language==='ko'?`${month.getMonth()+1}월 횟수`:`${month.toLocaleDateString('en-US',{month:'short'})} sessions`}</p><strong>{monthNotes.length}<small>{language==='ko'?'회':monthNotes.length===1?'session':'sessions'}</small></strong></article>
        <article><p>Total</p><strong>{notes.length}<small>{language==='ko'?'개':notes.length===1?'note':'notes'}</small></strong></article>
      </section>
      <EggGarden notes={notes} today={today} selected={selectedDay} onSelect={setSelectedDay}/>
      <ProfileEditor/>
      <DeviceLinks/>
    </>}
    {signedIn&&view!=='connect'&&<section className={`notes-section ${view==='notes'?'full-notes':''}`}><div className="section-title"><div><h2>{selectedDay?(language==='ko'?`${selectedDay.slice(0,4)}년${selectedDay.slice(5,7)}월${selectedDay.slice(8,10)}일 공부노트`:`Study notes · ${new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}`):view==='home'?t('최근 공부 노트'):t('저장한 노트')}{!selectedDay&&<span className="inline-count">{view==='home'?notes.length:filtered.length}</span>}</h2></div></div>{view==='notes'&&<div className="notes-tools"><label className="search-box"><Icon name="search" size={18}/><input aria-label={t('노트 검색')} placeholder={t('제목, 주제, 내용 검색')} value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label={language==='en'?'Sort notes':'노트 정렬'} value={sortBy} onChange={e=>setSortBy(e.target.value as 'latest'|'comments'|'views')}><option value="latest">{language==='en'?'Newest':'최신순'}</option><option value="comments">{language==='en'?'Most comments':'댓글 많은순'}</option><option value="views">{language==='en'?'Most viewed':'조회수 많은순'}</option></select></div>}{!ready?<div className="empty-state">{t('기록을 불러오고 있어요.')}</div>:filtered.length?<div className="notes-ledger"><table><thead><tr><th scope="col">{language==='en'?'Date':'날짜'}</th><th scope="col">{language==='en'?'Title':'제목'}</th><th scope="col">{language==='en'?'Views':'조회'}</th><th scope="col">{language==='en'?'Comments':'댓글'}</th><th scope="col"><span className="ledger-download-heading">{language==='en'?'Download':'다운로드'}</span></th></tr></thead><tbody>{(view==='home'?filtered.slice(0,homeLimit):filtered).map(note=><tr key={note.id}><td><time dateTime={note.date}>{note.date.replaceAll('-','.')}</time></td><td className="ledger-title"><button onClick={()=>openDetail(note)}>{note.title}</button></td><td>{note.views??0}</td><td>{note.comments?.length??0}</td><td><NoteDownload iconOnly note={note} english={language==='en'} onMarkdown={()=>download(note)} onOriginal={accountId===note.ownerId&&note.messages?.length?()=>downloadOriginal(note):undefined}/></td></tr>)}</tbody></table>{view==='home'&&filtered.length>homeLimit&&<button className="text-button notes-more" onClick={showMore}>{t('기록에서 더보기')} <Icon name="arrow" size={16}/></button>}</div>:<div className="empty-state">{selectedDay&&selectedDay<today?<><EmptyNotebook/><h3>{language==='en'?`No study records for ${selectedDay.replaceAll('-','.')}.`:`${selectedDay.replaceAll('-','.')}에는 공부 기록이 존재하지 않아요`}</h3></>:<><h3>{search||subject!=='전체'||selectedDay?t('아직 해당하는 기록이 없어요'):t('아직 공부 노트가 없습니다')}</h3><p>{search||subject!=='전체'?t('검색어나 주제를 바꿔보세요.'):t('공부한 내용을 기록하면 이곳에 표시됩니다.')}</p><button className="text-button" onClick={()=>changeView('connect')}>{t('GPT와 공부하기')} <Icon name="arrow" size={16}/></button></>}</div>}</section>}
    <div className="study-container" hidden={view!=='connect'}><StudyChat resume={resume} onLogout={()=>{changeView('connect');setDetail(null);setEditor(false);setNotice('');}} onAccount={onAccount} onRecordsLoaded={onRecordsLoaded} onRecord={note=>setNotes(previous=>[{...note,ownerId:accountId??undefined},...previous.filter(n=>n.id!==note.id)])}/></div>
    <footer><span>proving</span><span>{t('개인 공부 기록')}</span></footer></main></div>
    <dialog ref={dialogRef} className="editor-dialog" onCancel={()=>setEditor(false)} onClick={e=>{if(e.target===e.currentTarget)setEditor(false);}}><form onSubmit={save}><div className="dialog-heading"><div><h2>{editing?t('공부 노트 수정'):t('공부 기록하기')}</h2></div><button type="button" className="close-button" aria-label={t('닫기')} onClick={()=>setEditor(false)}>×</button></div><label>{t('무엇을 공부했나요?')}<input autoFocus required maxLength={100} placeholder={language==='en'?'e.g. PostgreSQL primary and foreign keys':'예: PostgreSQL의 기본 키와 외래 키'} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label><div><label>{t('공부 날짜')}<input type="date" required max={today} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label></div><label>{t('주제')}<input maxLength={40} placeholder={language==='en'?'e.g. Databases, English, reading':'예: 데이터베이스, 영어, 독서'} value={draft.subject} onChange={e=>setDraft({...draft,subject:e.target.value})}/></label><label>{t('공부 노트')}<span className="label-hint">{t('Markdown으로 작성할 수 있어요')}</span><textarea required rows={9} maxLength={100000} placeholder={language==='en'?'## What I learned\n\n## What needs clarification\n\n## Review questions':'## 오늘 배운 것\n\n## 헷갈렸던 내용\n\n## 다시 떠올려 볼 질문'} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/></label>{detailNotice&&<p role="status">{detailNotice}</p>}<div className="form-bottom"><span>{language==='ko'?'기록하면 해당 날짜에 저장됩니다.':'Saved under the selected date.'}</span><button className="button primary" disabled={storageError||recordBusy} type="submit">{t('노트 저장하기')}<Icon name="check" size={17}/></button></div></form></dialog>
    <dialog ref={detailRef} className="detail-dialog" onCancel={()=>setDetail(null)} onClick={e=>{if(e.target===e.currentTarget)setDetail(null);}}>{detail&&<><div className="dialog-heading"><h2>{detail.title}</h2><button className="close-button" onClick={()=>setDetail(null)} aria-label={t('닫기')}>×</button></div><div className="detail-meta-row"><div className="detail-meta"><time>{detail.date}</time><span>{language==='en'?'Views':'조회'} {detail.views??0}</span></div><div className="detail-actions"><button className="text-button delete" disabled={recordBusy} onClick={()=>void removeRecord(detail,false)}>{t('삭제')}</button><div><button className="button secondary detail-edit" onClick={()=>openEditor(detail)}>{t('수정')}</button><NoteDownload note={detail} english={language==='en'} onMarkdown={()=>download(detail)} onOriginal={ownsDetail&&detail.messages?.length?()=>downloadOriginal(detail):undefined}/></div></div></div><div className="record-tabs" role="tablist" aria-label={t('기록 보기')}><button id="summary-tab" role="tab" aria-selected={detailView==='summary'} aria-controls="record-panel" onClick={()=>{setDetailView('summary');setDetailNotice('');}}>{t('공부 노트')}</button>{ownsDetail&&<button id="original-tab" role="tab" aria-selected={detailView==='original'} aria-controls="record-panel" onClick={()=>{setDetailView('original');setDetailNotice('');}}>{t('원본 대화')}</button>}</div><div id="record-panel" role="tabpanel" aria-labelledby={detailView==='summary'||!ownsDetail?'summary-tab':'original-tab'}>{detailView==='summary'||!ownsDetail?<div className="note-content"><StudyMarkdown>{detail.content}</StudyMarkdown></div>:detail.messages?.length?<div className="original-content"><pre className="original-transcript" tabIndex={0} aria-label={t('원본 대화 텍스트')}>{transcript(detail,language)}</pre><div className="original-actions"><button className="original-copy" onClick={()=>copyOriginal(detail)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>{language==='en'?'Copy all':'전체 복사'}</button><button type="button" className="text-button delete" disabled={recordBusy} onClick={()=>void removeRecord(detail,true)}>{language==='en'?'Delete original conversation':'원본 대화 삭제'}</button></div></div>:<p className="original-empty">{t('이 기록에는 저장된 원본 대화가 없습니다. 앞으로 GPT 공부를 기록할 때 함께 저장됩니다.')}</p>}</div>{detailNotice&&<p className="detail-notice" role="status">{detailNotice}</p>}{ownsDetail&&<div className="continue-study"><button className="button secondary" onClick={()=>{setResume({key:crypto.randomUUID(),note:detail});setDetail(null);changeView('connect');}}>{language==='en'?'Continue studying':'이어서 공부하기'} <Icon name="arrow" size={16}/></button></div>}<section className="note-comments" aria-label={language==='en'?'Comments':'댓글'}><h3>{language==='en'?'Comments':'댓글'} <span>{detail.comments?.length??0}</span></h3>{detail.comments?.map(c=><article className="note-comment" key={c.id}><div><strong>{c.author}</strong><time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString(language==='en'?'en-US':'ko-KR',{dateStyle:'short',timeStyle:'short'})}</time><button className="text-button" onClick={()=>removeComment(c.id)} aria-label={language==='en'?'Delete comment':'댓글 삭제'}>{t('삭제')}</button></div><p>{c.content}</p></article>)}<form onSubmit={addComment}><textarea aria-label={language==='en'?'Write a comment':'댓글 작성'} placeholder={language==='en'?'Leave feedback on this note.':'내용에 대한 피드백을 남겨주세요'} rows={1} maxLength={2000} value={comment} onChange={e=>{setComment(e.target.value);e.target.style.height='auto';e.target.style.height=`${Math.min(e.target.scrollHeight,96)}px`;}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/><button className="comment-send" type="submit" aria-label={language==='en'?'Post comment':'댓글 등록'} disabled={!comment.trim()||storageError}>↑</button></form></section></>}</dialog>
  </div>;
}
