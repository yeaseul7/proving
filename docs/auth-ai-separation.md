# 로그인·AI 호출 분리 설계

## 결정 사항

- **배포 로그인:** Google만 (Supabase Auth)
- **AI 호출:** 사용자 자신의 ChatGPT 플랜으로 한다. 운영자 API 키는 선택 기능으로 두고 기본은 끈다.
- **DB:** 로컬과 배포가 같은 Supabase 프로젝트를 쓴다.

## 공식 문서 기준 제약 (2026-11-05 확인)

| 문서 | 내용 |
| --- | --- |
| [ChatGPT plan usage 개요](https://developers.openai.com/siwc/token-sharing-open-source) | 플랜 사용 문서는 "open-source and locally hosted apps"용이다. 원격 호스팅·유료 앱은 [관심 신청 양식](https://openai.com/form/sign-in-with-chatgpt-interest/)으로 안내한다. |
| [On your website](https://developers.openai.com/siwc/website) | 웹사이트용 Sign in with ChatGPT는 신원(`openid profile email`)만 다루며, 선정된 상용 파트너에게 제한적으로 제공한다. |
| [Self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) | 사용자가 오픈소스 앱을 자기 원격 VM에서 실행할 때, 로컬에서 로그인한 자격 증명을 그 VM으로 옮기는 방법을 안내한다. |

따라서 **승인 전까지 배포 서버(Vercel)는 사용자 ChatGPT 토큰을 받거나 저장하지 않고, 사용자 플랜으로 GPT를 호출하지 않는다.** 사용자 플랜 호출은 사용자가 직접 실행하는 proving(자기 PC 또는 자기 VM)에서만 한다. 원격 호스팅 사용을 원하면 관심 신청 양식을 제출하고, 승인 조건을 받은 뒤 별도로 설계한다.

## 구조: 로컬 학습 앱 + 배포 사이트

```
[사용자 PC의 proving]  ── ChatGPT 로그인(동적 등록) ──▶ OpenAI (사용자 플랜으로 GPT 호출)
        │  토큰은 이 PC의 .local/에만 저장
        │
        │  동기화 토큰(사용자별·폐기 가능)으로 HTTPS 호출
        ▼
[배포 사이트 (Vercel)] ── Google 로그인(Supabase Auth)
        │  노트·기록·프로필 조회/편집, 공개 프로필, 동기화 API
        ▼
[Supabase PostgreSQL: study 스키마]  ← 서버만 접근
```

| 실행 형태 | 인증 (`AUTH_PROVIDER`) | AI (`AI_PROVIDER`) | DB 접근 | 하는 일 |
| --- | --- | --- | --- | --- |
| 로컬 학습 앱 | `siwc` (ChatGPT, 동적 등록) | `chatgpt-plan` | 배포 사이트의 동기화 API | 공부 대화·요약·기록 |
| 배포 사이트 | `supabase` (Google) | `none` (기본) 또는 `openai-key` | 서버 `pg` 연결 | 기록 열람·편집, 프로필, 공유 |
| 운영자 개발 환경 | `siwc` | `chatgpt-plan` | 서버 `pg` 연결 (현재 방식) | 개발·테스트 |

- 허용하지 않는 조합은 서버 시작 시 검사해 기동을 중단한다: `chatgpt-plan`은 `siwc` + 로컬 실행에서만, 배포(`NEXT_PUBLIC_SITE_URL`이 루프백이 아님)에서는 `siwc`·`chatgpt-plan` 금지.
- 다른 사용자가 로컬 학습 앱을 실행할 때 `DATABASE_URL`을 받으면 안 된다. 로컬 학습 앱은 DB에 직접 붙지 않고 배포 사이트의 동기화 API만 호출한다. 운영자 개발 환경만 직접 연결을 유지한다.

## 계정 연결 (로컬 ChatGPT 계정 ↔ 배포 Google 계정)

같은 사람이 두 곳에서 같은 노트를 보려면 두 신원을 하나의 `study.users`에 연결한다.

1. 배포 사이트에 Google로 로그인 → "로컬 앱 연결" → 1회용 연결 코드(8자리, 10분 유효, 1회 사용) 발급
2. 로컬 학습 앱에서 코드 입력 → 배포 사이트 `/api/devices/link`에 코드와 기기 이름 전송
3. 서버가 코드 검증 후 **동기화 토큰**(무작위 32바이트) 발급. DB에는 해시만 저장한다.
4. 로컬 앱은 동기화 토큰을 `.local/sync.json`(0600)에 저장하고, 이후 모든 동기화 요청에 `Authorization: Bearer`로 보낸다.
5. 로컬 ChatGPT 신원(`account_key`)도 같은 사용자에 연결해, 이전 로컬 데이터가 있으면 합친다(충돌 시 사용자 확인).

- 배포 사이트의 "연결된 기기"에서 기기별 동기화 토큰을 폐기할 수 있다. 폐기된 기기는 다시 연결 코드가 필요하다.
- 동기화 토큰은 이 서비스의 노트·기록 API에만 쓰는 자체 토큰이다. ChatGPT 토큰과 무관하며 OpenAI 호출에 쓸 수 없다.

## 인터페이스

```ts
// lib/auth/types.ts
export type Identity = {
  provider: 'chatgpt' | 'google' | 'device';
  accountKey: string;   // sha256(issuer:subject). device는 sha256(동기화 토큰 id)
  name: string;
};
export interface AuthProvider {
  getIdentity(request?: Request): Promise<Identity | null>;
  startLogin(request: Request): Promise<Response>;
  finishLogin(request: Request): Promise<Response>;
  logout(): Promise<{ remoteRevoked?: boolean }>;
}

// lib/ai/types.ts
export type AiStatus = { mode: 'plan' | 'key' | 'none'; canChat: boolean; remainingToday?: number };
export interface AiProvider {
  status(ctx: AiContext): Promise<AiStatus>;
  listModels(ctx: AiContext): Promise<{ id: string; name: string }[]>;
  respond(ctx: AiContext, input: { model: string; messages: ChatMessage[]; instructions: string }):
    Promise<{ text: string; usage?: { input: number; output: number } }>;
}

// lib/sync/types.ts — 공부 데이터 저장 위치 추상화
export interface StudyStore {
  load(): Promise<Workspace>;                        // GET /api/study-sync 와 같은 결과
  apply(change: StudyChange): Promise<ApplyResult>;  // POST /api/study-sync 와 같은 명령
}
```

- `StudyStore` 구현은 두 가지: `DbStudyStore`(서버 `pg`, 현재 `lib/study-sync.ts`)와 `RemoteStudyStore`(배포 사이트 동기화 API 호출). 로컬 학습 앱의 `/api/study-sync`는 설정에 따라 둘 중 하나를 쓴다. 브라우저 코드는 바꾸지 않는다.
- SIWC의 `accountKey`는 지금 `account` 값과 같게 계산해 기존 브라우저 저장 데이터와 DB 연결을 유지한다.

## AI 공급자

- `chatgpt-plan` (로컬): 지금의 `/v1/responses`, `/v1/models` 호출과 SIWC 오류 처리를 그대로 옮긴다. 플랜 안내·재인증·사용량 관리 링크는 이 모드에서만 보인다.
- `none` (배포 기본): 배포 사이트에서는 "공부 대화는 내 PC의 proving에서 진행해요" 안내와 로컬 앱 설치·연결 방법을 보여준다. 기록 열람·편집·공유는 그대로 된다.
- `openai-key` (선택, 기본 꺼짐): 운영자 `OPENAI_API_KEY`로 호출한다. 비용이 운영자에게 청구되므로 켤 경우 사용자별 하루 한도와 월 상한(`ai_usage` 테이블), 모델 허용 목록이 필수다. 사용자 플랜 사용과 섞지 않는다.

## DB 변경 (마이그레이션 003)

```sql
CREATE TABLE study.user_identities (
  user_id uuid NOT NULL REFERENCES study.users(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('chatgpt', 'google')),
  account_key text NOT NULL CHECK (account_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, account_key)
);
INSERT INTO study.user_identities (user_id, provider, account_key)
SELECT id, 'chatgpt', oauth_account_id FROM study.users;

CREATE TABLE study.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES study.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE study.link_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES study.users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
```

- 세 테이블 모두 RLS를 켜고 `anon`·`authenticated`·`service_role` 권한을 회수한다.
- `users.oauth_account_id`는 이전 기간 동안 유지하고 NOT NULL만 해제한다. 모든 조회가 `user_identities`로 옮겨진 뒤 제거한다.
- `ai_usage` 테이블은 `openai-key`를 켤 때 추가한다.

## 보안 점검 항목

- 배포 사이트의 모든 쿼리는 서버에서 확인한 신원(Google 세션 또는 동기화 토큰)으로 내부 `user_id`를 찾고 그 값으로만 제한한다.
- 연결 코드: 1회용, 10분 만료, 해시 저장, 사용자·IP별 시도 횟수 제한.
- 동기화 API: 기존 요청 크기 제한(5MB)과 입력 검사를 유지하고, 브라우저 Origin 대신 Bearer 토큰으로 인증한다. 동기화 토큰은 응답·로그에 출력하지 않는다.
- 공개 프로필은 지금처럼 소개글과 날짜별 개수만 노출한다.

## 화면 변경

- 배포 사이트: Google 로그인, 기록·프로필, "연결된 기기"(연결 코드 발급, 기기 폐기), 공부 화면 대신 로컬 앱 안내.
- 로컬 학습 앱: 첫 실행 시 "배포 사이트 계정에 연결"(코드 입력) 또는 "이 PC에서만 사용" 선택. 연결 상태와 마지막 동기화 시각 표시.
- `/api/session` 응답에 `provider`, `ai.mode`를 추가하고 기존 `account`, `canChat`은 유지한다.

## 단계별 진행

| 단계 | 내용 | 사용자에게 보이는 변화 | 완료 기준 |
| --- | --- | --- | --- |
| 1 | `lib/auth/`, `lib/ai/`, `lib/sync/` 인터페이스 도입, 현재 코드를 `siwc`·`chatgpt-plan`·`DbStudyStore`로 이동 | 없음 | 기존 단위·E2E·DB 통합 테스트 통과 |
| 2 | 마이그레이션 003, `study-users`를 `user_identities` 기반으로 변경 | 없음 | 기존 사용자 데이터 유지 확인 |
| 3 | 배포 모드: Google 로그인, Origin 검사, `AI_PROVIDER=none` 화면 | 로컬에서 배포 모드 시험 | 로그인·로그아웃·타인 데이터 차단 E2E |
| 4 | 기기 연결: 연결 코드, 동기화 토큰, `RemoteStudyStore` | 로컬 앱 ↔ 배포 사이트 동기화 | 연결·폐기·재연결, 동기화 충돌 테스트 |
| 5 | Vercel 비공개 배포 | 배포 | 실제 로그인→로컬 공부→배포 사이트에서 기록·공개 프로필 확인 |
| 6 | (선택) OpenAI 관심 신청 / `openai-key` 공급자 | — | 승인 조건 또는 한도 값 확정 후 결정 |

## 환경변수

| 이름 | 로컬 학습 앱 | 배포 사이트 |
| --- | --- | --- |
| `AUTH_PROVIDER` | `siwc` | `supabase` |
| `AI_PROVIDER` | `chatgpt-plan` | `none` (또는 `openai-key`) |
| `STUDY_STORE` | `remote` (운영자 개발 환경은 `db`) | `db` |
| `PROVING_SYNC_URL` | 배포 사이트 주소 | — |
| `NEXT_PUBLIC_SITE_URL` | `http://127.0.0.1:3005` | 배포 도메인 |
| `DATABASE_URL`, `SUPABASE_CA_PATH` | 운영자 개발 환경만 | Vercel 환경변수 (CA는 값으로 주입) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Google 로그인용 |
| `OPENAI_API_KEY`, 한도 값 | — | `openai-key`를 켤 때만 |

## 남은 결정

- 로컬 학습 앱 배포 방식: 지금처럼 저장소를 받아 `npm run dev`로 실행 / 데스크톱 앱으로 포장
- 동기화 충돌 정책: 마지막 저장 우선 / 메시지 단위 병합(현재 브라우저 병합 로직 재사용)
- 운영자 API 키 기능을 켤지 여부와 한도
