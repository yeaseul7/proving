# proving

증명하며 성장한다. 공부의 과정을 기록하고 배움을 쌓아가는 공간입니다.

본인 ChatGPT 계정으로 로그인하고 플랜 사용을 승인한 뒤, 사이트 안에서 공부하는 로컬 앱입니다. 공부 대화는 로그인 계정별로 Supabase에 보관합니다. 기록하기를 누르면 GPT가 공부 내용을 요약하고 원본 대화와 함께 보관합니다.

## 실행

```sh
npm install
npm run dev
```

반드시 http://127.0.0.1:3005 으로 접속합니다. 첫 화면의 `Continue with ChatGPT`를 눌러 OpenAI에서 로그인 및 플랜 사용을 승인합니다. 로그인 후 계정에 제공되는 모델을 선택하고 질문합니다. `기록하기`를 누르면 대화를 Markdown으로 요약하여 하나의 노트로 저장합니다. 노트는 하루 전체나 한 주제 등 사용자가 정한 공부 단위입니다. 날짜가 바뀌어도 진행 중인 노트는 분리하지 않습니다. 공부 중인 노트는 최대 3개이며 오른쪽 북마크에서 전환합니다. 노트별 제목과 입력 중인 질문을 보관합니다. 기록 후에도 같은 노트에서 대화를 이어갈 수 있으며 다시 기록하면 해당 노트를 갱신합니다. 공부 노트 화면에서 `.md`를 내려받을 수 있습니다.

## 인증 범위와 한계

- 공식 Sign in with ChatGPT의 로컬 동적 클라이언트 등록, PKCE S256, state·nonce 및 JWKS 서명 검증을 사용합니다.
- 개인 플랜 사용은 OpenAI의 계정·플랜·앱 자격과 승인 조건을 따릅니다. 실제 계정 로그인과 모델 응답은 사용자의 승인 후 확인해야 합니다.
- 이 구현은 `127.0.0.1`의 로컬 실행 전용입니다. 사용자 PC의 HTTP 루프백 콜백으로 돌아옵니다. 공개 웹서비스에 그대로 배포할 수 없습니다. 공개 다중 사용자 서비스는 승인된 웹 클라이언트 등록 및 별도 세션·DB 설계가 필요합니다.
- 기존 ChatGPT 대화·기억·커스텀 GPT 설정을 가져오지 않습니다. 이 사이트에서 새 대화를 진행합니다.
- 별도 API 키를 요청하거나 다른 앱의 토큰을 재사용하지 않습니다.

## 보관 방식

- OAuth access·refresh 토큰은 서버의 `.local/sessions`에 파일 권한 0600(디렉터리 0700)으로 보관합니다. 브라우저에는 HttpOnly 세션 ID만 전달합니다. 로그인은 마지막 인증 요청부터 30일 유지되며 사용 중 자동 연장됩니다. 서버 재시작 후에도 세션을 복원하고, 로그아웃 시 저장된 세션을 삭제합니다. OpenAI 갱신 권한이 만료·철회되면 재로그인이 필요합니다. 이 파일 저장소는 로컬 단일 서버용입니다.
- `.local/host-id`는 설치별 호스트 식별자입니다. Git에서 제외되며 토큰이 아닙니다.
- 검증된 계정의 클라이언트 ID와 subject는 `.local/registrations/`에 소유자 전용 권한으로 보관합니다. HttpOnly 등록 식별 쿠키로 재로그인 시 복원하므로 로그아웃과 서버 재시작 후에도 같은 등록을 재사용합니다. access·refresh·ID 토큰은 이 파일에 저장하지 않습니다. 쿠키 삭제 또는 다른 브라우저 사용 시 새 등록이 필요할 수 있습니다.
- 로그인한 계정의 진행 중 대화와 초안은 Supabase PostgreSQL에 저장합니다. 브라우저에도 진행 중 대화의 복구 사본을 계정별로 보관합니다. 동기화할 수 없는 기존 브라우저 대화는 별도로 백업합니다.
- 진행 중 노트는 최대 3개입니다. 기록하기는 공부 요약과 원본 대화를 함께 저장한 뒤 노트를 보관함으로 옮깁니다. 보관함에서 원본을 보거나 TXT로 내려받을 수 있으며, 원본을 삭제해도 요약은 남습니다.
- 기존 브라우저 보관 기록은 해당 브라우저에서 계속 볼 수 있습니다.
- 답변이 `response.completed`로 완료되어야 기록합니다. 중단·사용 한도 오류는 성공 기록으로 저장하지 않습니다. 완료 전까지 화면에는 대기 상태를 표시합니다.
- Supabase의 비공개 study 스키마를 서버의 PostgreSQL 연결로 사용합니다.

## 구조

- `lib/chat-auth.ts`: 로컬 OAuth, 세션, 갱신 및 로그아웃
- `app/auth/`: 로그인 시작·콜백
- `app/api/`: 계정 확인·모델 목록·공부 대화·로그아웃
- `components/study-chat.tsx`: 공부 채팅 및 자동 노트 생성
- `lib/study.ts`: 공부일, 연속일 및 Markdown 내보내기
- `components/profile-editor.tsx`, `app/api/profile/`: 개요의 내 프로필(Markdown 소개글·아이디·공개 여부)
- `app/u/[handle]/`: 공개 프로필. 사용자별 title·description·canonical·Open Graph·Twitter 메타 태그와 JSON-LD(ProfilePage)를 생성한다. 절대 URL은 `NEXT_PUBLIC_SITE_URL`(기본 `http://127.0.0.1:3005`)을 기준으로 한다. 로컬 실행 중에는 외부에서 열리지 않으므로 공유·검색 노출은 배포 후에 동작한다.

공식 문서:
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

## 검증

```sh
npm run typecheck
npm test
npm run build
```

DB 통합 테스트는 `.env.local`의 Supabase에 접속하며, 만든 행은 모두 롤백합니다.

```sh
node --conditions=react-server --experimental-strip-types --test tests/*.integration.ts
```

## 브라우저 E2E 테스트

```sh
npm install
npx playwright install chromium
npm run test:e2e
```

`test:e2e`는 프로덕션 빌드 후 테스트 전용 서버(`127.0.0.1:3015`)를 자동 실행·종료합니다. 해당 포트는 비워두세요. 기존 개발 서버는 3005 포트를 사용합니다. 빌드 중에는 같은 작업 폴더의 개발 서버를 종료하는 것을 권장합니다.

```sh
# 화면에서 테스트를 선택하고 실행
npm run test:e2e:ui
# 실패 trace와 스크린샷을 포함한 보고서
npm run test:e2e:report
# 빌드가 이미 최신일 때 브라우저를 보면서 실행
npx playwright test --headed
```

- 설정: `playwright.config.ts`, 시나리오: `e2e/study.spec.ts`
- 비로그인 전송 제한, 대화·초안 복원, 노트 3개 제한, AI 오류 재시도, 요약·원본 저장, Markdown 다운로드 파일명을 확인합니다.
- 각 테스트의 브라우저 저장소는 격리됩니다. 세션·모델·AI API는 모킹하며 실제 계정이나 유료 AI를 호출하지 않습니다. 실제 OAuth, 서버 API 인증, 다운로드 본문 및 PDF 인쇄 성공은 별도 확인해야 합니다.
- 실제 로그인 후 질문 → 답변 → 기록 → 새로고침을 한 차례 확인하세요. 한국어 조합 중 Enter로 전송되지 않는지, Shift+Enter가 줄바꿈되는지도 직접 확인하세요.

## 로컬 성능 점검

```sh
npm run build
npm run start
```

Chrome에서 `http://127.0.0.1:3005`에 접속합니다. 성능 개선 전후 같은 데이터·브라우저·CPU 설정으로 3회 측정해 중앙값을 비교하세요. 아래 항목은 측정 가이드이며 자동 성능 테스트나 최적화 적용 내역이 아닙니다.

| 측정 | 방법 | 비교 항목 |
| --- | --- | --- |
| 첫 화면 | 시크릿 창 Lighthouse 모바일 측정 | LCP, CLS, TBT |
| 초기 다운로드 | Network에서 Disable cache 후 새로고침 | JS 전송량, 요청 순서 |
| 입력 반응 | Performance에서 CPU 4배 감속 후 긴 대화에 질문 입력 | 50ms 이상 긴 작업, 입력 지연 |
| 대화 렌더링 | React Profiler로 입력 전후 기록 | 변경 없는 과거 메시지의 재렌더링 |
| 기록 목록 | 수식·코드가 있는 노트 10개와 100개로 목록 진입 | 렌더링 시간, PDF용 숨김 Markdown 비용 |
| 응답 대기 | 첫 질문과 후속 질문의 Network 타이밍 비교 | 답변 후 제목 생성으로 추가되는 지연 |

Lighthouse TBT는 실제 사용자 INP와 다른 지표입니다. 외부 AI 응답 시간은 변동이 크므로 한 번의 결과로 개선 효과를 판단하지 마세요. 우선 검토할 개선은 제목 요청 병렬화, PDF 클릭 시 Markdown 생성, 초안 저장 debounce, 기존 메시지 렌더링 메모화입니다.

로그아웃은 OpenID discovery의 revocation endpoint로 최신 Refresh Token의 원격 세션 폐기를 요청합니다. 네트워크·5xx 오류만 최대 3회(요청별 4초 제한, 250ms·500ms 대기) 시도하고, 성공 여부와 관계없이 로컬 토큰을 삭제합니다. 원격 폐기를 확인하지 못하면 화면에서 안내하므로 ChatGPT 설정에서 연결을 확인하세요. 등록 Client ID와 기존 공부 기록은 유지합니다.

## SIWC 권한 및 오류 복구

- 첫 플랜 연결 시 플랜·크레딧 사용 안내를 표시합니다. 확인 여부는 계정별로 이 브라우저에 저장합니다. 사용량 관리 링크는 최초 안내와 사용량 제한 안내에서 표시합니다. 개인/조직 플랜 종류를 추측하지 않습니다.
- 401·만료/철회 오류는 초안을 저장한 뒤 사용자 선택으로 재인증합니다. 권한 승인 동작만 `prompt=consent`를 사용하며 일반 로그인은 강제 동의하지 않습니다.
- 403은 계정·워크스페이스 정책 안내, 429는 사용량 관리와 명시적 재시도, 5xx·네트워크 오류는 수동 재시도를 제공합니다. AI 추론은 자동 재시도하지 않습니다.
- 상위 HTTP 상태, 오류 코드, 제한된 param, request ID를 응답에 보존합니다. 개인정보가 포함될 수 있는 원문 오류 본문·메시지와 토큰은 전달하거나 로그로 출력하지 않습니다. 스트림 오류는 코드에 따라 HTTP 상태를 매핑합니다.
- 제한·인증 오류가 나도 기존 대화·초안·요약을 삭제하지 않습니다. 로컬 저장 실패 시 질문 전송·재인증 이동·로그아웃을 중지하여 저장되지 않은 내용의 손실을 막습니다.
- 서버는 사용자 로컬의 단일 프로세스 실행용입니다. 토큰은 기존 `.local/` 저장소만 사용하며 원격 영구 저장·공개 배포는 지원하지 않습니다.

공식 기준: [계정·세션](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [오류·복구](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery), [UI/UX](https://developers.openai.com/siwc/ui-ux-guidelines).
