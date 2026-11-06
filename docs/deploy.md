# 배포 (Vercel + Supabase)

배포 사이트는 Google 로그인(Supabase Auth)을 쓰고, 서버는 GPT를 호출하지 않는다. 공부는 사용자 Google Cloud 프로젝트에 OAuth로 연결한 Gemini로 하거나, 내 PC의 proving(ChatGPT 플랜)에서 하고 기기 연결로 동기화한다. 설계: [auth-ai-separation.md](auth-ai-separation.md)

## 1. DB 마이그레이션

```sh
node --conditions=react-server --experimental-strip-types scripts/db-schema.mjs --apply
```

`003_identities_devices`가 적용되어야 한다. 기존 사용자는 `user_identities`의 `chatgpt` 신원으로 그대로 이어진다.

## 2. Supabase Auth (Google)

1. Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션)
   - 승인된 리디렉션 URI: `https://<프로젝트 ref>.supabase.co/auth/v1/callback`
2. Supabase Dashboard → Authentication → Sign In / Providers → Google: 위 Client ID·Secret 입력 후 사용
3. Supabase Dashboard → Authentication → URL Configuration
   - Site URL: `https://<배포 도메인>`
   - Redirect URLs: `https://<배포 도메인>/auth/callback`
4. Project Settings → API Keys에서 publishable key 확인
5. `study` 스키마를 Exposed schemas에 추가하지 않는다.

## 3. Vercel 환경변수 (Production)

| 이름 | 값 |
| --- | --- |
| `AUTH_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_SITE_URL` | `https://<배포 도메인>` (요청 Host와 정확히 같아야 한다) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<프로젝트 ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `DATABASE_URL` | Supabase **transaction pooler** 주소 (포트 `6543`) |
| `SUPABASE_CA_CERT` | `certs/supabase-ca.crt` 본문 (줄바꿈은 `\n`도 가능) |
| `DB_POOL_MAX` | `1` |
| `SIGNUP_ALLOWLIST` | 베타 허용 이메일, 쉼표 구분 (비우면 누구나 가입) |

`AI_PROVIDER`, `STUDY_STORE`는 비워 둔다(기본: AI 없음, DB 저장). 조합이 맞지 않으면 API가 요청을 처리하지 않는다(`lib/runtime-mode.ts`).

Preview 배포는 도메인이 달라 Host 검사에 걸린다. Preview에도 쓰려면 해당 주소로 `NEXT_PUBLIC_SITE_URL`을 따로 지정한다.

## 4. 배포

```sh
npx vercel link
npx vercel --prod
```

배포 후 확인: Google 로그인 → 개요 → 프로필 저장 → `/u/<아이디>` 메타 태그 → Google OAuth로 Gemini를 연결해 질문 → 기록.

## 5. 운영자 기존 노트 연결

배포 사이트에 Google로 한 번 로그인한 뒤, 기존(ChatGPT 로그인) 노트를 같은 사용자로 연결한다.

```sh
node --conditions=react-server --experimental-strip-types scripts/link-google-identity.mjs you@gmail.com          # 확인만
node --conditions=react-server --experimental-strip-types scripts/link-google-identity.mjs you@gmail.com --apply  # 실행
```

## 6. 내 PC의 proving 연결 (선택)

배포 사이트 → 개요 → 연결된 기기 → "내 PC 연결하기"로 코드를 받는다. PC의 `.env.local`:

```sh
STUDY_STORE=remote
PROVING_SYNC_URL=https://<배포 도메인>
```

```sh
npm run link -- ABCD-EFGH-JKMN
npm run dev
```

PC의 proving은 ChatGPT 플랜으로 공부하고, 노트·기록은 배포 사이트 DB에 저장된다. 이 모드에서는 PC에 `DATABASE_URL`이 필요 없다. 기기 토큰은 `.local/sync.json`에만 있고, 배포 사이트의 "연결 끊기"로 폐기한다.

## Gemini Google Cloud OAuth

proving의 Google 로그인은 Supabase Auth를 사용한다. Gemini용 Google Cloud 연결은 별도의 권한 승인이다. 사용자가 연결 시 입력한 프로젝트로만 모델을 호출한다.

1. Google Cloud 프로젝트에서 결제를 연결하고 Vertex AI API (`aiplatform.googleapis.com`)를 활성화한다. Gemini 모델이 지원되는 리전을 선택한다.
2. 호출에 사용할 Google 계정에 해당 프로젝트의 모델 호출 권한을 부여한다. 테스트 상태인 외부 OAuth 앱은 해당 계정을 테스트 사용자로 추가한다.
3. Google Auth Platform에서 모델 권한 연결용 **웹 애플리케이션** OAuth 클라이언트를 만들고 승인된 리디렉션 URI를 등록한다. 로컬은 `http://127.0.0.1:3005/auth/google-cloud/callback`, 배포는 `https://<배포 도메인>/auth/google-cloud/callback`이다. `NEXT_PUBLIC_SITE_URL`의 주소와 일치해야 한다.
4. 개발은 `.env.local`, 배포는 Vercel 서버 환경변수에 아래 값을 등록한다.

| 이름 | 값 |
| --- | --- |
| `GOOGLE_CLOUD_OAUTH_CLIENT_ID` | 모델 권한 연결용 OAuth 웹 클라이언트 ID |
| `GOOGLE_CLOUD_OAUTH_CLIENT_SECRET` | 해당 클라이언트 Secret |
| `GOOGLE_CLOUD_OAUTH_COOKIE_KEY` | `openssl rand -base64 32`로 생성한 서버 전용 키 |
| `GOOGLE_CLOUD_LOCATION` | Gemini 모델이 지원되는 리전. 생략 시 `global` |
| `GOOGLE_CLOUD_GEMINI_MODEL` | 해당 리전에서 호출할 Gemini 모델 ID |

설정 적용 후 proving에 로그인하고 **Gemini로 시작하기**를 선택한다. 본인 Cloud 프로젝트 ID를 입력하고 Google OAuth 권한을 승인한다. 연결한 Google 계정에 프로젝트 사용 및 모델 호출 권한이 필요하다.

호출은 설정한 Cloud 프로젝트에 청구된다. 사용자가 승인한 접근 토큰은 계정에 묶인 암호화 HttpOnly 쿠키에 보관하며, 최대 한 시간 또는 토큰 만료 시각까지 사용한다. 갱신 토큰을 요청하지 않으므로 만료 뒤에는 다시 연결한다.
