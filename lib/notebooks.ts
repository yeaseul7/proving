import { validStoredMessages, type ChatMessage } from './chat.ts';
export const MAX_NOTEBOOKS=3;
export type Notebook={id:string;title:string;date:string;messages:ChatMessage[];draft?:string;summary?:string;recorded?:boolean;updatedAt?:string;resumed?:ResumedNote};
// 이어하기에서 앞쪽 count개 메시지는 복습을 시작하기 위한 맥락이다.
export type ResumedNote={count:number;summary:string};
export type NotebookWorkspace={activeId:string;notebooks:Notebook[]};
export function isNotebook(value:unknown):value is Notebook{
  if(!value||typeof value!=='object')return false;
  const n=value as Record<string,unknown>;
  return typeof n.id==='string'&&n.id.length>0&&typeof n.title==='string'&&n.title.length<=100&&typeof n.date==='string'&&validStoredMessages(n.messages)&&(n.draft===undefined||typeof n.draft==='string')&&(n.summary===undefined||typeof n.summary==='string')&&(n.recorded===undefined||typeof n.recorded==='boolean')&&(n.resumed===undefined||isResumed(n.resumed,(n.messages as ChatMessage[]).length));
}
function isResumed(value:unknown,length:number):value is ResumedNote{
  if(!value||typeof value!=='object')return false;
  const r=value as Record<string,unknown>;
  return Number.isSafeInteger(r.count)&&(r.count as number)>=0&&(r.count as number)<=length&&typeof r.summary==='string'&&r.summary.trim().length>0&&r.summary.length<=200000;
}
export function readWorkspace(value:unknown):NotebookWorkspace{
  if(!value||typeof value!=='object')throw new Error('저장된 노트 형식이 올바르지 않습니다.');
  const w=value as Record<string,unknown>;
  if(!Array.isArray(w.notebooks)){
    const migrated={...w,title:typeof w.title==='string'?w.title:'제목 없는 노트'};
    if(!isNotebook(migrated))throw new Error('이전 대화를 불러오지 못했습니다.');
    return {activeId:migrated.id,notebooks:[migrated]};
  }
  if(w.notebooks.length<1||w.notebooks.length>MAX_NOTEBOOKS||!w.notebooks.every(isNotebook)||new Set(w.notebooks.map(n=>n.id)).size!==w.notebooks.length)throw new Error('저장된 노트 목록이 올바르지 않습니다.');
  return {activeId:w.notebooks.some(n=>n.id===w.activeId)?w.activeId as string:w.notebooks[0].id,notebooks:w.notebooks};
}
export function addNotebook(workspace:NotebookWorkspace,note:Notebook):NotebookWorkspace{
  if(workspace.notebooks.length>=MAX_NOTEBOOKS)throw new Error('노트는 최대 3개까지 만들 수 있습니다.');
  if(workspace.notebooks.some(n=>n.id===note.id))throw new Error('같은 노트가 이미 있습니다.');
  return {activeId:note.id,notebooks:[...workspace.notebooks,note]};
}
export function canRecordNotebook(note: Notebook): boolean {
  const messages = note.messages.slice(note.resumed?.count ?? 0);
  const firstQuestion = messages.findIndex(message => message.role === 'user');
  return firstQuestion >= 0 && messages.slice(firstQuestion + 1).some(message => message.role === 'assistant');
}

// 이어하기한 노트는 이전 기록을 맥락으로만 주고 그 뒤에 나눈 대화만 요약한다.
export function summaryMessages(note:Notebook,language:'ko'|'en'='ko'):ChatMessage[]{
  if(!note.resumed)return note.messages;
  const added=note.messages.slice(note.resumed.count);
  if(!canRecordNotebook(note))throw new Error(language==='en'?'There is no new conversation to record yet.':'이어서 나눈 대화가 없어 기록할 내용이 없습니다.');
  const context=language==='en'
    ?`The study note below was already recorded. Do not summarize it again. Use it only as context and write the note only about what the conversation after it newly covers.\n\n${note.resumed.summary}`
    :`아래는 이미 기록한 학습 노트다. 다시 정리하지 말고 맥락으로만 참고한다. 이후 대화에서 새로 다룬 내용만 노트로 정리한다.\n\n${note.resumed.summary}`;
  return [{role:'user',content:context},...added];
}
