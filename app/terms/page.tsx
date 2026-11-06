import type { Metadata } from 'next';

export const metadata: Metadata = { title: '서비스 이용약관' };

export default function TermsPage() {
  return (
    <main className="policy-page">
      <a href="/">← Proving 홈</a>
      <h1>서비스 이용약관</h1>
      <p>Proving은 AI 공부 대화, 학습 노트 요약과 저장, 기록 조회 및 내보내기 기능을 제공합니다.</p>

      <h2>계정 및 Gemini 연결</h2>
      <p>사용자는 사용할 권한이 있는 Google 계정과 Google Cloud 프로젝트를 연결해야 합니다. Gemini 요청에 따른 요금과 사용 한도는 연결한 프로젝트의 Google Cloud 설정 및 Google의 약관을 따릅니다.</p>

      <h2>학습 콘텐츠와 AI 답변</h2>
      <p>사용자는 입력하거나 공개하는 콘텐츠에 필요한 권한을 확보해야 합니다. 공개 설정을 선택하면 해당 화면의 공개 범위에 따라 다른 사람이 내용을 볼 수 있습니다. AI 답변과 요약에는 오류가 있을 수 있으므로 중요한 내용은 원자료를 확인하세요.</p>

      <h2>서비스 이용</h2>
      <p>다른 사람의 계정이나 프로젝트를 허가 없이 사용하거나, 서비스 접근 제한을 우회하거나, 서비스 운영을 방해해서는 안 됩니다. 연결한 공급자의 이용약관도 준수해야 합니다.</p>

      <h2>문의</h2>
      <p>서비스 이용 문의는 <a href="https://github.com/yeaseul7/proving">Proving 프로젝트</a>의 운영자에게 연락해 주세요. 데이터 처리에 관한 내용은 <a href="/privacy">개인정보처리방침</a>에서 확인할 수 있습니다.</p>
    </main>
  );
}
