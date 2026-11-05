# 배포 (Vercel + Supabase)

배포 사이트는 Google 로그인(Supabase Auth)을 쓰고, 서버는 GPT를 호출하지 않는다. 공부는 사용자가 등록한 Claude·Gemini API 키로 브라우저에서 하거나, 내 PC의 proving(ChatGPT 플랜)에서 하고 기기 연결로 동기화한다. 설계: [auth-ai-separation.md](auth-ai-separation.md)

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

배포 후 확인: Google 로그인 → 개요 → 프로필 저장 → `/u/<아이디>` 메타 태그 → API 키로 질문 → 기록.

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
