// 서버(/api/chat)와 브라우저 직접 호출(Claude·Gemini)이 같은 지시문을 쓰도록 한곳에 둔다.
export type StudyLanguage = 'ko' | 'en';

export function studyInstructions(language: StudyLanguage, summarize: boolean) {
  return (language==='en'?'Write all replies and study notes in English. ':'한국어로 답변한다. ')+ 'Format code in fenced Markdown blocks with a language identifier. Use $...$ for inline math and $$ on separate lines for display equations. Never put mathematical notation in code fences. '+(summarize?'사용자와의 공부 대화를 Markdown 학습 노트로 정리한다. 본문에는 ## 핵심 개념과 ## 이해가 부족한 부분 두 섹션만 작성한다. 영어로 작성할 때는 ## Key concepts와 ## Areas to revisit를 사용한다. 대화에서 확인된 내용만 적고, 이해가 부족한 부분이 확인되지 않으면 그렇게 명시한다. 제목, 복습 질문 및 퀴즈 문항을 출력하지 않는다.':'공부 도우미다. 사용자의 이해 수준을 확인하고 개념과 예제를 간결하게 설명한다. 필요한 경우 짧은 복습 질문을 한다. 사실이 불확실하면 명시한다.');
}

export function reviewKickoff(summary: string, language: StudyLanguage) {
  const request = language === 'en'
    ? 'Let’s review this note. Start with **Review question 1**. Ask one question at a time, prioritizing areas to revisit. Wait for my answer before giving feedback and asking the next numbered question.'
    : '이 노트를 복습할게요. **복습 질문 1**부터 시작해주세요. 이해가 부족한 부분을 우선해서 한 번에 한 문항만 질문하고, 제 답변을 기다린 뒤 피드백과 다음 번호의 질문을 주세요.';
  return `${request}\n\n---\n\n${summary.slice(0, 20_000 - request.length - 7)}`;
}

export function titleInstructions(language: StudyLanguage) {
  return language==='en'?'Name this study conversation in 2–6 words based on the user request. Return only the title, without quotes or Markdown. Do not answer the request.':'사용자의 첫 질문을 바탕으로 공부 대화 제목을 15자 내외로 짓는다. 질문에 답하지 말고 따옴표나 Markdown 없이 제목만 출력한다.';
}

export const cleanTitle = (title: string) => title.trim().replace(/^['"#\s]+|['"\s]+$/g,'').slice(0,100);
