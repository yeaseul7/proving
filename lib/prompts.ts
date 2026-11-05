// 서버(/api/chat)와 브라우저 직접 호출(Claude·Gemini)이 같은 지시문을 쓰도록 한곳에 둔다.
export type StudyLanguage = 'ko' | 'en';

export function studyInstructions(language: StudyLanguage, summarize: boolean) {
  return (language==='en'?'Write all replies and study notes in English. ':'한국어로 답변한다. ')+ 'Format code in fenced Markdown blocks with a language identifier. Use $...$ for inline math and $$ on separate lines for display equations. Never put mathematical notation in code fences. '+(summarize?'사용자와의 공부 대화를 하나의 Markdown 학습 노트로 정리한다. 노트 제목은 이미 별도로 저장되어 있으므로 제목을 생성하거나 본문에 반복하지 않는다. # 제목 없이 ## 핵심 개념부터 본문을 시작한다. 핵심 개념, 이해가 부족한 부분, 복습 질문을 포함한다. 대화에서 다루지 않은 사실이나 학습 성과를 꾸며내지 않는다. 노트 본문만 출력한다.':'공부 도우미다. 사용자의 이해 수준을 확인하고 개념과 예제를 간결하게 설명한다. 필요한 경우 짧은 복습 질문을 한다. 사실이 불확실하면 명시한다.');
}

export function titleInstructions(language: StudyLanguage) {
  return language==='en'?'Name this study conversation in 2–6 words based on the user request. Return only the title, without quotes or Markdown. Do not answer the request.':'사용자의 첫 질문을 바탕으로 공부 대화 제목을 15자 내외로 짓는다. 질문에 답하지 말고 따옴표나 Markdown 없이 제목만 출력한다.';
}

export const cleanTitle = (title: string) => title.trim().replace(/^['"#\s]+|['"\s]+$/g,'').slice(0,100);
