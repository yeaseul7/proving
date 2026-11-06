import type { Metadata } from 'next';

export const metadata: Metadata = { title: '개인정보처리방침' };

export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <a href="/">← Proving 홈</a>
      <h1>개인정보처리방침</h1>
      <p>Proving은 AI와 나눈 공부 대화를 정리하고 학습 노트를 저장하는 서비스입니다.</p>

      <h2>처리하는 정보와 사용 목적</h2>
      <ul>
        <li>Google 로그인 시 Supabase Auth가 계정 식별자, 이메일, 표시 이름을 처리합니다. Proving은 이를 로그인과 계정 식별, 사용자별 기록 접근에 사용합니다.</li>
        <li>Gemini를 연결하면 사용자가 입력한 Google Cloud 프로젝트 ID와 OAuth 접근 토큰을 처리합니다. 이 권한은 선택한 프로젝트에서 사용자가 요청한 Gemini 공부 채팅, 제목 생성, 노트 요약을 실행하는 데 사용합니다.</li>
        <li>노트 제목, 질문과 답변, 초안, 요약과 학습 날짜를 저장해 학습 기록을 제공합니다. 사용자가 공개 설정을 켠 프로필은 공개 페이지에서 볼 수 있습니다.</li>
      </ul>

      <h2>저장 및 외부 서비스 이용</h2>
      <p>로그인은 Supabase Auth를 통해 처리하며 학습 기록은 서비스 데이터베이스와 기기의 브라우저 저장소에 저장될 수 있습니다. Gemini 연결 정보는 브라우저의 암호화된 HttpOnly 쿠키에 저장되며, 접근 토큰 만료 시각까지 최대 한 시간 유지됩니다.</p>
      <p>Gemini 기능을 요청하면 답변이나 요약에 필요한 질문과 대화 문맥을 Google Cloud Vertex AI로 전송합니다. Proving은 Google API에서 받은 정보를 광고에 사용하거나 판매하지 않습니다. Google API에서 받은 정보의 사용과 이전에는 Limited Use 요건을 포함한 <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>를 따릅니다.</p>

      <h2>삭제 및 연결 해제</h2>
      <p>저장한 노트는 기록 화면에서 삭제할 수 있습니다. 로그아웃하면 현재 기기의 Gemini 연결 쿠키가 제거됩니다. Google 권한은 <a href="https://myaccount.google.com/connections">Google 계정의 연결 관리</a>에서도 철회할 수 있습니다. 연결 해제는 이미 저장된 노트를 삭제하지 않습니다.</p>
      <p>계정 정보의 열람·정정·삭제 요청이나 개인정보 문의는 <a href="https://github.com/yeaseul7/proving">Proving 프로젝트</a>의 운영자에게 연락해 주세요. 공개 게시물에 계정 정보, 대화 내용 또는 인증 정보를 올리지 마세요.</p>
    </main>
  );
}
