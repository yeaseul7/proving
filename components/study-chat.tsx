'use client';
import { useLanguage } from '@/components/language-provider';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { GptLogo } from '@/components/gpt-logo';
import { RecordingLoader } from '@/components/recording-loader';
import { StudyDemo } from '@/components/study-demo';
import { StudyMarkdown } from '@/components/study-markdown';
import { createPortal } from 'react-dom';
import { addNotebook, MAX_NOTEBOOKS, readWorkspace, summaryMessages, type Notebook as Conversation } from '@/lib/notebooks';
import { recoveryFor, type Recovery } from '@/lib/siwc-errors';
import { validMessages, validStoredMessages } from '@/lib/chat';
import { loadStudy, writeStudy, type StoredStudyNote } from '@/lib/study-sync-client';
import { dateKey, type StudyNote } from '@/lib/study';

export type Account={account:string;name:string;canChat:boolean};
function serverSnapshot({id,title,date,draft,messages}:Conversation) {
  return JSON.stringify({id,title,date,draft:draft??'',messages});
}
const blankNotebook=():Conversation=>({id:crypto.randomUUID(),title:'제목 없는 노트',date:dateKey(),messages:[],draft:''});
export function StudyChat({onRecord,onRecordsLoaded,onAccount,onLogout,resume}:{resume?:{key:string;note:StudyNote}|null;onRecord:(note:StoredStudyNote)=>void;onRecordsLoaded:(records:StoredStudyNote[],account:string)=>void;onAccount:(account:Account|null)=>void;onLogout:()=>void}){
  const {language,t}=useLanguage();
  const [accountHost,setAccountHost]=useState<HTMLElement|null>(null);
  useEffect(()=>setAccountHost(document.getElementById('sidebar-account')),[]);
  const [account,setAccount]=useState<Account|null>(null);
  const [checking,setChecking]=useState(true);
  const [models,setModels]=useState<{id:string;name:string}[]>([]);
  const [model,setModel]=useState('');
  const [notebooks,setNotebooks]=useState<Conversation[]>([{id:'initial',title:t('제목 없는 노트'),messages:[],date:''}]);
  const [activeId,setActiveId]=useState('initial');
  const conversation=notebooks.find(n=>n.id===activeId)??notebooks[0];
  function setConversation(current:Conversation){setNotebooks(old=>old.map(n=>n.id===current.id?current:n));}
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [recording,setRecording]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');
  const [historyError,setHistoryError]=useState(false);
  const syncQueue = useRef<Promise<unknown>>(Promise.resolve());
  const synced = useRef(new Map<string, string>());
  const [syncError, setSyncError] = useState('');
  const [syncRetry, setSyncRetry] = useState(0);

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = syncQueue.current.then(work, work);
    syncQueue.current = result.catch(() => {});
    return result;
  }

  function saveToServer(accountId: string, notebook: Conversation) {
    const snapshot = serverSnapshot(notebook);
    return enqueue(async () => {
      if (synced.current.get(notebook.id) === snapshot) return;
      await writeStudy(accountId, { action: 'save', notebook });
      synced.current.set(notebook.id, snapshot);
    });
  }

  useEffect(() => {
    if (!account || checking || busy || historyError) return;
    const timer = setTimeout(async () => {
      try {
        const changed = notebooks.filter(note =>
          synced.current.has(note.id) || notebooks.length > 1 || note.messages.length || note.draft || note.title !== '제목 없는 노트');
        await Promise.all(changed.map(note => saveToServer(account.account, note)));
        setSyncError('');
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : '대화를 서버에 저장하지 못했습니다.');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [account, checking, busy, historyError, notebooks, syncRetry]);
  const [recovery,setRecovery]=useState<Recovery|null>(null);
  const [welcome,setWelcome]=useState(false);
  const usageUrl='https://chatgpt.com/settings/usage';
  function handleFailure(status:number,data:{error?:string;code?:string;recovery?:Recovery}){
    setRecovery(data.recovery??recoveryFor(status,data.code));
    setError(data.error||'요청을 처리하지 못했습니다.');
  }
  function acknowledgePlan(){
    try{localStorage.setItem(`study-plan-notice-${account?.account}`,'1');setWelcome(false);}
    catch{setError('안내 확인을 저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요.');}
  }
  function reauthenticate(){
    if(!store({...conversation,draft:input}))return;
    location.assign('/auth/login?reauthorize=1');
  }

  const scrollRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const activeRequest=useRef<AbortController|null>(null);
  function fitInput(){
    const field=inputRef.current;if(!field)return;
    if(!field.value){field.style.height='28px';field.style.overflowY='hidden';field.closest<HTMLElement>('.study-paper')?.style.setProperty('--chat-input-height','28px');return;}
    field.style.height='0px';
    const maxHeight=parseFloat(getComputedStyle(field).lineHeight)*3;
    field.style.height=`${Math.min(field.scrollHeight,maxHeight)}px`;
    field.style.overflowY=field.scrollHeight>maxHeight?'auto':'hidden';
    field.closest<HTMLElement>('.study-paper')?.style.setProperty('--chat-input-height',field.style.height);
  }
  useLayoutEffect(()=>{fitInput();},[input]);
  useEffect(()=>{window.addEventListener('resize',fitInput);return()=>window.removeEventListener('resize',fitInput);},[]);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try{
        const response=await fetch('/api/session',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('로그인 상태를 확인하지 못했습니다. 새로고침해주세요.');
        const session=await response.json();
        const a:Account|null=session.account?session:null;
        setAccount(a);onAccount(a);
        if(a?.canChat){try{setWelcome(localStorage.getItem(`study-plan-notice-${a.account}`)!=='1');}catch{setWelcome(true);}}
        const initial=blankNotebook();let workspace={activeId:initial.id,notebooks:[initial]};
        let localReadable = true;
        try{
          const raw=localStorage.getItem(`study-notebooks-${a?.account??'local'}`)??(a?localStorage.getItem(`study-chat-${a.account}`):null);
          if(raw)workspace=readWorkspace(JSON.parse(raw));
        }catch{localReadable=false;setHistoryError(true);setError('저장된 노트를 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.');}
        if (a) {
          try {
            const remote = await loadStudy(a.account, controller.signal);
            synced.current = new Map(remote.notebooks.map(note => [note.id, serverSnapshot(note)]));
            const closed = new Set(remote.closedIds);
            const local = workspace.notebooks.filter(note => !closed.has(note.id));
            const remoteIds = new Set(remote.notebooks.map(note => note.id));
            let diverged = false;
            const merged = remote.notebooks.map(note => {
              const cached = local.find(candidate => candidate.id === note.id);
              if (!cached) return note;
              const extendsServer = note.messages.every((message, index) =>
                cached.messages[index]?.role === message.role && cached.messages[index]?.content === message.content);
              diverged ||= cached.messages.slice(0, note.messages.length).some((message, index) =>
                message.role !== note.messages[index].role || message.content !== note.messages[index].content);
              if (extendsServer && (cached.messages.length > note.messages.length || cached.summary ||
                (cached.updatedAt ?? '') > (note.updatedAt ?? ''))) return cached;
              // 서버는 이어하기 표시를 저장하지 않으므로 브라우저 값을 유지한다.
              return extendsServer && cached.resumed && cached.resumed.count <= note.messages.length ? { ...note, resumed: cached.resumed } : note;
            });
            const unsynced = local.filter(note => !remoteIds.has(note.id) &&
              (local.length > 1 || note.messages.length || note.draft || note.title !== '제목 없는 노트'));
            if (diverged || merged.length + unsynced.length > MAX_NOTEBOOKS) {
              localStorage.setItem(`study-notebooks-backup-${a.account}-${Date.now()}`, JSON.stringify(workspace));
              setError('서버와 달라서 합칠 수 없는 브라우저 대화를 별도 백업했습니다.');
            }
            const combined = [...merged, ...unsynced.map(note => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(note.id)
              ? note : { ...note, id: crypto.randomUUID() })].slice(0, MAX_NOTEBOOKS);
            workspace = {
              notebooks: combined.length ? combined : [initial],
              activeId: combined.find(note => note.id === workspace.activeId)?.id ?? combined[0]?.id ?? initial.id,
            };
            onRecordsLoaded(remote.records, a.account);
            if (localReadable) localStorage.setItem(`study-notebooks-${a.account}`, JSON.stringify(workspace));
          } catch (error) {
            if (controller.signal.aborted) return;
            setSyncError(error instanceof Error ? error.message : '서버 기록을 불러오지 못했습니다.');
          }
        }
        setNotebooks(workspace.notebooks);setActiveId(workspace.activeId);setInput(workspace.notebooks.find(n=>n.id===workspace.activeId)?.draft??'');
        if(a?.canChat){const r=await fetch('/api/models',{signal:controller.signal,cache:'no-store'});const data=await r.json();if(!r.ok){handleFailure(r.status,data);return;}setModels(data.models);setModel(data.models[0]?.id??'');if(!data.models.length)setError('이 계정에서 사용할 수 있는 모델이 없습니다.');}
        if(new URLSearchParams(location.search).has('auth_error')){setError('ChatGPT 로그인을 완료하지 못했습니다. 계정의 연동 권한을 확인하고 다시 시도해주세요.');history.replaceState(null,'',location.pathname);}
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'연결 상태를 확인하지 못했습니다.');}
      finally{if(!controller.signal.aborted)setChecking(false);}
    }
    void load();return()=>{controller.abort();activeRequest.current?.abort();};
  },[onAccount,onRecordsLoaded]);
  useLayoutEffect(()=>{
    const area=scrollRef.current?.parentElement;if(!area)return;
    if(!conversation.messages.length){area.scrollTop=0;return;}
    const questions=area.querySelectorAll<HTMLElement>('.chat-message.user');
    const question=questions.item(questions.length-1);if(!question)return;
    const top=question.getBoundingClientRect().top-area.getBoundingClientRect().top+area.scrollTop-area.clientTop;
    // Keep a long question's ending visible while reserving room for the reply.
    const visibleQuestionHeight=Math.max(0,area.clientHeight-110);
    const offset=Math.max(0,question.offsetHeight-visibleQuestionHeight);
    area.scrollTop=Math.max(0,top+offset-12);
  },[conversation.id,conversation.messages,busy]);
  function saveWorkspace(next:Conversation[],selected:string){
    if(historyError)return false;
    try{localStorage.setItem(`study-notebooks-${account?.account??'local'}`,JSON.stringify({activeId:selected,notebooks:next}));setNotebooks(next);setActiveId(selected);return true;}
    catch{setError(t('브라우저에 저장하지 못했습니다. 공간을 확인해주세요.'));return false;}
  }
  const resumed=useRef<string|null>(null);
  useEffect(()=>{
    if(!resume||resumed.current===resume.key||checking)return;
    resumed.current=resume.key;
    if(!account||resume.note.ownerId!==account.account){setError(language==='en'?'Only your own notes can be continued.':'본인의 노트만 이어서 공부할 수 있습니다.');return;}
    if(busy||historyError){setError(language==='en'?'Finish the current request and try again.':'진행 중인 요청을 마친 뒤 다시 시도해주세요.');return;}
    const workspace=notebooks.map(n=>n.id===activeId?{...n,draft:input}:n);
    const empty=workspace.find(n=>!n.messages.length&&!n.draft?.trim());
    if(!empty&&workspace.length>=MAX_NOTEBOOKS){setError(language==='en'?'Close or record a notebook first (maximum 3).':'노트는 최대 3개입니다. 기존 노트를 기록하거나 삭제한 뒤 이어서 공부해주세요.');return;}
    const messages=resume.note.messages?.length?resume.note.messages.map(m=>({...m})):[{role:'user' as const,content:language==='en'?'Continue studying from this note.':'이 노트를 바탕으로 공부를 이어갈게요.'},{role:'assistant' as const,content:resume.note.content}];
    const next:Conversation={...blankNotebook(),...(empty?{id:empty.id}:{}),title:resume.note.title,messages,resumed:{count:messages.length,summary:resume.note.content}};
    const updated=empty?workspace.map(n=>n.id===empty.id?next:n):[...workspace,next];
    if(saveWorkspace(updated,next.id)){setInput('');setError('');setSaved('');requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));}
  },[resume,checking,account,busy,historyError,notebooks,activeId,input,language]);
  function store(current:Conversation){
    const updated={...current,updatedAt:new Date().toISOString()};
    return saveWorkspace(notebooks.map(note=>note.id===updated.id?updated:note),updated.id);
  }
  function switchNotebook(id:string){
    if(busy||id===activeId)return;
    const next=notebooks.map(n=>n.id===activeId?{...n,draft:input}:n);
    if(saveWorkspace(next,id)){setInput(next.find(n=>n.id===id)?.draft??'');setError('');setSaved('');}
  }
  function createNotebook(){
    if(!account||busy||checking||historyError)return;
    try{const next=addNotebook({activeId,notebooks:notebooks.map(n=>n.id===activeId?{...n,draft:input}:n)},blankNotebook());if(saveWorkspace(next.notebooks,next.activeId)){setInput('');setError('');setSaved('');}}
    catch(e){setError(e instanceof Error?e.message:'노트를 만들지 못했습니다.');}
  }
  function dismissNotebook(id:string){
    const remaining=notebooks.filter(n=>n.id!==id).map(n=>n.id===activeId?{...n,draft:input}:n);
    const next=remaining.length?remaining:[blankNotebook()];
    const selected=id===activeId?next[0].id:activeId;
    if(!saveWorkspace(next,selected))return false;
    if(id===activeId)setInput(next.find(n=>n.id===selected)?.draft??'');
    return true;
  }
  async function removeNotebook(id:string){
    if (!account || busy || !confirm(language==='en'?'Permanently delete this conversation and draft?':'이 대화와 작성 중인 내용을 삭제할까요? 되돌릴 수 없습니다.')) return;
    setBusy(true);
    try {
      await enqueue(() => writeStudy(account.account, { action: 'discard', id }));
      synced.current.delete(id);
      if (dismissNotebook(id)) { setError(''); setSaved(''); }
    } catch (error) {
      setError(error instanceof Error ? error.message : '대화를 삭제하지 못했습니다.');
    } finally { setBusy(false); }
  }

  async function saveRecord(current:Conversation) {
    if (!account || !current.summary) return;
    setBusy(true);
    try {
      const { record } = await enqueue(() => writeStudy(account.account, { action: 'record', notebook: current }));
      if (!record) throw new Error('서버가 저장 결과를 반환하지 않았습니다.');
      onRecord(record);
      synced.current.delete(current.id);
      if (dismissNotebook(current.id)) setSaved(t('공부 내용을 요약해 기록했습니다.'));
      else {
        const remaining=notebooks.filter(note=>note.id!==current.id);
        const next=remaining.length?remaining:[blankNotebook()];
        setNotebooks(next);
        setActiveId(next[0].id);
        setInput(next[0].draft??'');
      }
    } catch (error) {
      store(current);
      setError(error instanceof Error ? error.message : '기록을 저장하지 못했습니다. 다시 시도해주세요.');
    } finally { setBusy(false); }
  }
  function renameNotebook(title:string){
    const next={...conversation,title};setConversation(next);store(next);
  }
  function finishRename(){
    store({...conversation,title:conversation.title.trim()||'제목 없는 노트'});
  }
  async function send(e?:FormEvent,summarize=false,retry=false){
    e?.preventDefault();if(busy||recovery||!account?.canChat||!model||historyError||(!summarize&&!retry&&!input.trim()))return;
    if(retry&&conversation.messages.at(-1)?.role!=='user')return;
    const base=conversation;
    const generateTitle=!summarize&&!retry&&base.messages.length===0&&['','제목 없는 노트','Untitled notebook'].includes(base.title.trim());
    const next:Conversation={...base,title:generateTitle?Array.from(input.trim().split('\n')[0]).slice(0,40).join(''):base.title,date:summarize?dateKey():base.date,summary:undefined,recorded:false,draft:summarize||retry?input:'',messages:summarize||retry?base.messages:[...base.messages,{role:'user',content:input.trim()}]};
    let requestMessages=next.messages;
    if(summarize){try{requestMessages=summaryMessages(next,language);}catch(e){setError(e instanceof Error?e.message:'기록하지 못했습니다.');return;}}
    if(!(summarize?validStoredMessages(requestMessages):validMessages(requestMessages))){setError('한 노트의 대화가 너무 깁니다. 기록하기로 정리한 뒤 다음 공부를 이어가세요.');return;}
    setBusy(true);setRecording(summarize);setError('');setSaved('');
    if(!summarize){if(!store(next)){setBusy(false);setRecording(false);return;}if(!retry)setInput('');}
    const controller=new AbortController();activeRequest.current=controller;
    try{
      await saveToServer(account.account, next);
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:account.account,model,messages:requestMessages,summarize,language,generateTitle}),signal:controller.signal});
      const data=await response.json();if(!response.ok){handleFailure(response.status,data);return;}
      if(data.account!==account.account)throw new Error('계정이 변경되었습니다. 새로고침해주세요.');
      const complete:Conversation=summarize?{...next,summary:data.text}:{...next,title:generateTitle&&typeof data.title==='string'&&data.title.trim()?data.title.trim().slice(0,100):next.title,messages:[...next.messages,{role:'assistant',content:data.text}]};
      setConversation(complete);
      if (summarize) await saveRecord(complete);
      else {
        store(complete);
        await saveToServer(account.account, complete);
      }
    }catch(e){setError(e instanceof Error?e.message:'응답을 받지 못했습니다.');}
    finally{setBusy(false);setRecording(false);activeRequest.current=null;inputRef.current?.focus({preventScroll:true});}
  }
  function recordStudy(){
    if(busy)return;
    if(!account?.canChat){setError(language==='en'?'Your session expired. Sign in again to summarize this conversation.':'로그인이 만료되었거나 플랜 사용 권한이 없습니다. 다시 로그인한 뒤 기록해주세요.');return;}
    if(!model){setError(language==='en'?'Select a model before recording.':'모델을 선택한 뒤 기록해주세요.');return;}
    if(historyError){setError(language==='en'?'Check your saved notebook before recording.':'저장된 노트를 불러오지 못해 기록이 중지되었습니다. 새로고침 후 확인해주세요.');return;}
    if(conversation.recorded)return;
    if (conversation.summary) { void saveRecord(conversation); return; }
    void send(undefined,true);
  }
  async function signOut(){
    if(busy)return;
    if(!store({...conversation,draft:input}))return;
    setBusy(true);
    try{await syncQueue.current;const response=await fetch('/api/logout',{method:'POST'});if(!response.ok)throw new Error();const result=await response.json();setRecovery(null);setWelcome(false);setAccount(null);setModels([]);setModel('');const blank=blankNotebook();setNotebooks([blank]);setActiveId(blank.id);setInput('');setSaved('');onAccount(null);onLogout();setError(result.revocationConfirmed===false?'이 기기에서는 로그아웃했습니다. 원격 토큰 폐기는 확인되지 않았습니다. ChatGPT 설정에서 앱 연결을 해제해주세요.':'');}
    catch{setError('로그아웃하지 못했습니다. 다시 시도해주세요.');}
    finally{setBusy(false);}
  }
  return <section className="study-space" aria-label={t('GPT 공부 채팅')}>
    {accountHost&&createPortal(<div className="sidebar-account-controls">{checking?<span>{t('계정 확인 중')}</span>:account?<><span className="connected-account" title={account.canChat?t('ChatGPT 플랜 연결됨'):t('플랜 사용 승인 필요')}><span className="status-dot"/>{account.name}</span><button className="logout-button" aria-label={t('로그아웃')} title={t('로그아웃')} disabled={busy} onClick={signOut}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/></svg></button></>:<a className="text-button" href="/auth/login" data-oai-siwc-button>Continue with ChatGPT</a>}</div>,accountHost)}
    {welcome && account?.canChat && (
      <div className="plan-welcome" role="dialog" aria-modal="false" aria-label="ChatGPT 플랜 사용 안내">
        <strong>{language === 'en' ? 'Using your ChatGPT plan' : 'ChatGPT 플랜을 사용합니다'}</strong>
        <p>{language === 'en'
          ? 'Answers, titles and summaries use your connected ChatGPT plan or credits. Manage limits in ChatGPT settings.'
          : '답변·제목 생성·요약은 연결한 ChatGPT 플랜 또는 크레딧을 사용합니다. ChatGPT 설정에서 사용량과 한도를 관리할 수 있습니다.'}</p>
        <div className="plan-welcome-actions">
          <a className="button secondary" href={usageUrl} target="_blank" rel="noreferrer">
            {language === 'en' ? 'Manage usage' : '사용량 관리'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 4h6v6m0-6-9 9m6 0v6H5V7h6" />
            </svg>
          </a>
          <button type="button" className="button primary" onClick={acknowledgePlan}>{language === 'en' ? 'Got it' : '확인'}</button>
        </div>
      </div>
    )}
    {recovery&&<div className="chat-recovery" role="status">{recovery==='reauth'||recovery==='permission'?<button type="button" className="text-button" disabled={busy} onClick={reauthenticate}>{language==='en'?'Reauthenticate with ChatGPT':'ChatGPT 다시 인증하기'}</button>:recovery==='usage'?<><a href={usageUrl} target="_blank" rel="noreferrer">{language==='en'?'Manage usage':'사용량 관리'}</a><button type="button" className="text-button" onClick={()=>{setRecovery(null);if(!models.length)location.reload();}}>{language==='en'?'I checked my limit':'사용량 확인 후 다시 시도'}</button></>:<button type="button" className="text-button" onClick={()=>{setRecovery(null);if(!models.length)location.reload();}}>{language==='en'?'Try again':'다시 시도'}</button>}<span>{language==='en'?'Your conversation and draft are preserved.':'공부 대화와 초안은 유지됩니다.'}</span></div>}
    {syncError && <p className="chat-error" role="status">{syncError} <button type="button" className="text-button" disabled={busy} onClick={()=>setSyncRetry(value=>value+1)}>{language==='en'?'Retry sync':'동기화 다시 시도'}</button></p>}
    {error&&<p className="chat-error" role="alert">{t(error)}</p>}
    {account&&!account.canChat&&<p className="chat-error">{t('로그인은 되었지만 AI 사용 권한이 없습니다.')} <button type="button" className="text-button" onClick={reauthenticate}>{t('ChatGPT 플랜 사용 승인하기')}</button></p>}
    <div className="notebook-desk"><div className="study-paper">{recording&&<RecordingLoader english={language==='en'}/>}<div className="paper-heading"><div className="notebook-title-sticker"><input className="notebook-title" aria-label={t('대화 제목')} maxLength={100} value={t(conversation.title)} disabled={!account||busy||checking||historyError} onChange={e=>renameNotebook(e.target.value)} onBlur={finishRename} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing)e.currentTarget.blur();}}/></div></div>
    <div className={`study-messages ${conversation.messages.length?'':'showing-example'}`} aria-label={t('공부 대화')} aria-busy={busy}>
      {!checking&&!account&&<div className="study-login-prompt"><a className="button primary" href="/auth/login" data-oai-siwc-button>Continue with ChatGPT</a></div>}
      {!conversation.messages.length&&<StudyDemo/>}
      {conversation.messages.map((message,i)=><article className={`chat-message ${message.role}`} key={i}>{message.role==='assistant'&&<span className="message-author gpt-avatar"><GptLogo/></span>}<StudyMarkdown>{message.content}</StudyMarkdown></article>)}
      {!busy&&conversation.messages.at(-1)?.role==='user'&&<button className="text-button retry-answer" onClick={()=>send(undefined,false,true)} disabled={Boolean(recovery)||!account?.canChat||!model}>{language==='en'?'Retry reply':'답변 다시 받기'} ↻</button>}
      {conversation.summary&&<article className="chat-message summary"><span className="message-author">{t('공부 노트')}</span><StudyMarkdown>{conversation.summary}</StudyMarkdown></article>}
      {busy&&!recording&&<p className="chat-thinking" role="status">{recording?t('대화에서 공부한 내용을 요약하고 있습니다…'):t('GPT가 답변을 준비하고 있습니다…')}</p>}<div ref={scrollRef}/>
    </div>
    {conversation.messages.some(message=>message.role==='user')&&conversation.messages.some(message=>message.role==='assistant')&&<div className="study-record-action"><span role="status">{t(saved)}</span><div>{conversation.summary&&!conversation.recorded&&<button className="text-button subdued" disabled={busy} onClick={()=>{setError('');saveRecord(conversation);}}>{t('기록 저장 재시도')}</button>}<button className="button primary" type="button" disabled={Boolean(recovery)||busy||conversation.recorded} onClick={recordStudy}>{recording?t('요약 중…'):conversation.recorded?t('기록 완료'):t('기록하기')}</button></div></div>}
    <form className="study-composer" onSubmit={e=>send(e)}><textarea ref={inputRef} disabled={!account||busy||checking||historyError} aria-label={t('공부 질문')} placeholder={t('질문을 입력하세요')} value={input} maxLength={20000} rows={1} onChange={e=>{setInput(e.target.value);store({...conversation,draft:e.target.value});}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><div className="composer-controls"><select aria-label={t('공부 모델')} value={model} disabled={!models.length||busy} onChange={e=>setModel(e.target.value)}>{!models.length&&<option value="">{t('로그인 후 모델 선택')}</option>}{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="button primary send-button" aria-label={busy?t('답변 중'):t('질문 보내기')} title={t('질문 보내기')} type="submit" disabled={Boolean(recovery)||checking||!account?.canChat||!input.trim()||!model||busy||historyError}>{busy?'…':'↑'}</button></div></form>


    </div><aside className="notebook-bookmarks" aria-label={t('공부 노트 북마크')}>{notebooks.map((note,i)=><div key={note.id} className={`notebook-bookmark bookmark-${i} ${note.id===activeId?'active':''}`}><button className="bookmark-switch" title={t(note.title.trim()||'제목 없는 노트')} aria-label={t(note.title.trim()||'제목 없는 노트')} aria-pressed={note.id===activeId} disabled={!account||busy||checking||historyError} onClick={()=>switchNotebook(note.id)}><span className="bookmark-title">{Array.from(t(note.title.trim()||'제목 없는 노트')).slice(0,3).join('')}...</span></button><button className="bookmark-delete" aria-label={language==='en'?`Delete ${note.title}`:`${note.title} 삭제`} title={t('삭제')} disabled={!account||busy||checking||historyError} onClick={()=>removeNotebook(note.id)}>×</button></div>)}<button className="notebook-add" disabled={!account||notebooks.length>=MAX_NOTEBOOKS||busy||checking||historyError} onClick={createNotebook}>{t('＋ 노트 추가')}</button></aside></div>
  </section>;
}
