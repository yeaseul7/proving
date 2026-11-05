'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
export type Language='ko'|'en';
const translations:Record<string,string>={
 "proving 홈":"proving home",
 "메인 메뉴":"Main navigation",
 "GPT 공부 채팅":"Study chat",
 "공부 대화":"Study conversation",
 "대화 후 기록하기로 공부 노트를 만드는 예시":"Preview: turn a study conversation into a note",
 "답변 준비 중":"Preparing a reply",
 "로그인 상태를 확인하지 못했습니다. 새로고침해주세요.":"Could not check your session. Refresh the page.",
 "저장된 노트를 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.":"Could not load your notebooks. Refresh and try again.",
 "이 계정에서 사용할 수 있는 모델이 없습니다.":"No models are available for this account.",
 "ChatGPT 로그인을 완료하지 못했습니다. 계정의 연동 권한을 확인하고 다시 시도해주세요.":"Could not sign in to ChatGPT. Check your permissions and try again.",
 "연결 상태를 확인하지 못했습니다.":"Could not check the connection.",
 "노트를 만들지 못했습니다.":"Could not create a notebook.",
 "한 노트의 대화가 너무 깁니다. 기록하기로 정리한 뒤 다음 공부를 이어가세요.":"This notebook is too long. Record it before continuing in another notebook.",
 "응답을 받지 못했습니다.":"Could not get a reply.",
 "계정이 변경되었습니다. 새로고침해주세요.":"Your account changed. Refresh the page.",
 "로그아웃하지 못했습니다. 다시 시도해주세요.":"Could not sign out. Try again.",
 "저장된 노트 형식이 올바르지 않습니다.":"The saved notebook format is invalid.",
 "이전 대화를 불러오지 못했습니다.":"Could not load the previous conversation.",
 "저장된 노트 목록이 올바르지 않습니다.":"The saved notebook list is invalid.",
 "노트는 최대 3개까지 만들 수 있습니다.":"You can have up to 3 notebooks.",
 "같은 노트가 이미 있습니다.":"This notebook already exists.",
 "앞선 응답이 완료된 뒤 다시 보내주세요.":"Wait for the current reply before sending another message.",
 "대화가 너무 깁니다. 새 공부를 시작해주세요.":"This conversation is too long. Start another notebook.",
 "로그인 계정이 변경되었습니다. 새로고침해주세요.":"Your signed-in account changed. Refresh the page.",
 "질문과 모델을 확인해주세요.":"Check your question and selected model.",
 "사용 가능한 모델을 불러오지 못했습니다. 계정의 플랜 사용 권한을 확인해주세요.":"Could not load models. Check your ChatGPT plan permissions.",
 "요청 출처를 확인할 수 없습니다.":"Could not verify the request origin.",
 "ChatGPT 계정으로 로그인해주세요.":"Sign in with your ChatGPT account.",
 "ChatGPT 플랜 사용이 승인되지 않았습니다. 다시 로그인해 사용 권한을 승인해주세요.":"ChatGPT plan usage is not authorized. Sign in again to authorize it.",
 "로그인 기간이 만료되었습니다. 다시 로그인해주세요.":"Your session expired. Sign in again.",
 "로그인을 갱신하지 못했습니다. 다시 로그인해주세요.":"Could not renew your session. Sign in again.",
 "로그인 갱신 응답이 올바르지 않습니다.":"The session renewal response is invalid.",
 "로그아웃된 세션입니다.":"This session has been signed out.",
 "ChatGPT 플랜 사용 권한이 없습니다.":"ChatGPT plan usage is not authorized.",
 "응답이 너무 깁니다. 질문 범위를 줄여주세요.":"The reply is too long. Narrow down your question.",
 "응답을 완료하지 못했습니다. 플랜 사용 한도와 연결 상태를 확인해주세요.":"Could not complete the reply. Check your plan limits and connection.",
 "응답 형식을 읽지 못했습니다.":"Could not read the response format.",
 "응답이 중단되었습니다. 다시 시도해주세요.":"The reply was interrupted. Try again.",
 "로그인이 만료되었습니다. 다시 로그인해주세요.":"Your session expired. Sign in again.",
 "ChatGPT 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.":"Your ChatGPT usage limit was reached. Try again later.",
 "ChatGPT 요청이 거절되었습니다. 선택한 모델과 플랜 사용 권한을 확인해주세요.":"ChatGPT declined the request. Check the selected model and plan permissions.",
 "대화를 처리하지 못했습니다.":"Could not process the conversation.",

 '배우는 중':'Learning','개요':'Overview','기록':'Records',
 '공부':'Study','공부 기록':'Study history','내 공부 노트':'My notes','공부와 기록':'Study & notes','공부 통계':'Study statistics','연속 공부일':'Study streak','전체 노트':'Total notes','최근 공부 노트':'Recent notes','저장한 노트':'Saved notes','전체 보기':'View all','노트 검색':'Search notes','제목, 주제, 내용 검색':'Search title, subject, or content','주제 필터':'Filter by subject','전체':'All','기록을 불러오고 있어요.':'Loading your notes…','아직 해당하는 기록이 없어요':'No matching notes','아직 공부 노트가 없습니다':'No study notes yet','검색어나 주제를 바꿔보세요.':'Try another search or subject.','공부한 내용을 기록하면 이곳에 표시됩니다.':'Your recorded notes will appear here.','GPT와 공부하기':'Study with GPT','기록에서 더보기':'See more in history','개인 공부 기록':'Personal study notes','닫기':'Close','알림 닫기':'Dismiss notification','공부 노트 수정':'Edit study note','공부 기록하기':'Record your study','무엇을 공부했나요?':'What did you study?','공부 날짜':'Study date','주제':'Subject','공부 노트':'Study note','Markdown으로 작성할 수 있어요':'Markdown supported','노트 저장하기':'Save note','원본 대화':'Original conversation','전체 텍스트 복사':'Copy full text','TXT 다운로드 ↓':'Download TXT ↓','이 기록에는 저장된 원본 대화가 없습니다. 앞으로 GPT 공부를 기록할 때 함께 저장됩니다.':'No original conversation was saved with this note. New study records will include it.','삭제':'Delete','수정':'Edit','Markdown 다운로드':'Download Markdown','기록 보기':'Record view','원본 대화 텍스트':'Original conversation text','계정 확인 중':'Checking account…','로그아웃':'Log out','대화 제목':'Chat title','현재 노트 삭제':'Delete current notebook','공부 질문':'Study question','질문을 입력하세요':'Ask a question','공부 모델':'Study model','로그인 후 모델 선택':'Sign in to select a model','답변 중':'Replying…','질문 보내기':'Send message','기록 저장 재시도':'Retry saving','요약 중…':'Summarizing…','기록 완료':'Recorded','기록하기':'Record','＋ 노트 추가':'+ Add notebook','공부 노트 북마크':'Notebook bookmarks','제목 없는 노트':'Untitled notebook','플랜 사용 승인 필요':'Plan authorization required','ChatGPT 플랜 연결됨':'ChatGPT plan connected','로그인은 되었지만 AI 사용 권한이 없습니다.':'You are signed in, but plan usage is not authorized.','ChatGPT 플랜 사용 승인하기':'Authorize ChatGPT plan usage','대화에서 공부한 내용을 요약하고 있습니다…':'Summarizing what you studied…','GPT가 답변을 준비하고 있습니다…':'GPT is preparing a reply…','공부 내용을 요약해 기록했습니다.':'Study summary recorded.','요약은 완료했지만 기록을 저장하지 못했습니다. 기록 저장 재시도를 눌러주세요.':'The summary is ready, but saving failed. Select Retry saving.','브라우저에 저장하지 못했습니다. 공간을 확인해주세요.':'Could not save. Check your browser storage.','오늘 하루 그만 보기':"Don't show again today",'예시 닫기':'Close preview','오늘 숨김을 저장하지 못했습니다. 닫기 버튼을 이용해주세요.':'Could not save this preference. Close the preview instead.','나':'You','적게':'Less','많이':'More','공부 달력에 기록됨':'Added to study history','공부 노트와 챌린지를 저장했습니다.':'Study note saved.','원본 대화를 복사했습니다.':'Conversation copied.','원본 대화를 TXT로 내려받았습니다.':'Conversation downloaded as TXT.','복사하지 못했습니다. 아래 텍스트를 선택해 복사하거나 TXT로 내려받아주세요.':'Could not copy. Select the text below or download the TXT file.','노트를 삭제했어요.':'Note deleted.','원본 대화가 없습니다.':'No original conversation.',
};
const LanguageContext=createContext<{language:Language;setLanguage:(value:Language)=>void;t:(text:string)=>string}>({language:'ko',setLanguage:()=>{},t:text=>text});
export function LanguageProvider({children}:{children:ReactNode}){
 const [language,setValue]=useState<Language>('ko');
 useEffect(()=>{try{if(localStorage.getItem('study-language')==='en')setValue('en');}catch{}},[]);
 useEffect(()=>{document.documentElement.lang=language;},[language]);
 function setLanguage(value:Language){setValue(value);try{localStorage.setItem('study-language',value);}catch{}}
 return <LanguageContext.Provider value={{language,setLanguage,t:text=>language==='en'?(translations[text]??text):text}}>{children}</LanguageContext.Provider>;
}
export const useLanguage=()=>useContext(LanguageContext);
