# 배포 (Vercel + Supabase)

배포 사이트는 공개 공부 기록을 읽는 블로그다. Google·GitHub 계정 로그인은 제공하지 않는다. Supabase는 PostgreSQL 저장소로 사용한다.

## 1. DB 마이그레이션

```sh
node --conditions=react-server --experimental-strip-types scripts/db-schema.mjs --apply
```

공개 개요의 방문객 집계에는 `005_blog_visitors`까지 적용해야 한다. 기존 사용자는 `user_identities`의 `chatgpt` 신원으로 그대로 이어진다.

## 2. Supabase 설정

`study` 스키마는 Exposed schemas에 추가하지 않는다. 기존 Google·GitHub 로그인 공급자가 활성화되어 있다면 Supabase Dashboard의 Authentication → Sign In / Providers에서 끈다.

## 3. Vercel 환경변수 (Production)

| 이름 | 값 |
| --- | --- |
| `AUTH_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_SITE_URL` | `https://<배포 도메인>` (요청 Host와 정확히 같아야 한다) |
| `DATABASE_URL` | Supabase **transaction pooler** 주소 (포트 `6543`) |
| `SUPABASE_CA_CERT` | `certs/supabase-ca.crt` 본문 (줄바꿈은 `\n`도 가능) |
| `DB_POOL_MAX` | `1` |

`AI_PROVIDER`, `STUDY_STORE`는 비워 둔다(기본: AI 없음, DB 저장). 조합이 맞지 않으면 API가 요청을 처리하지 않는다(`lib/runtime-mode.ts`).

Preview 배포는 도메인이 달라 Host 검사에 걸린다. Preview에도 쓰려면 해당 주소로 `NEXT_PUBLIC_SITE_URL`을 따로 지정한다.

## 4. 배포

```sh
npx vercel link
npx vercel --prod
```

배포 후 공개 개요와 기록이 로그인 없이 열리는지 확인한다.

## main 푸시 전 E2E 검사

저장소를 처음 받은 기기에서 아래 명령을 한 번 실행한다.

```sh
npx playwright install chromium
git config core.hooksPath .githooks
```

이후 `git push origin main`은 프로덕션 빌드와 Playwright E2E 테스트를 먼저 실행한다. 푸시할 커밋을 체크아웃한 상태여야 하고 작업 트리는 깨끗해야 한다. 검사에 실패하면 푸시가 중단되므로 Vercel 자동 배포도 시작되지 않는다.

## 개인 공부 블로그 모드 (현재 운영 방식)

배포 사이트는 소유자의 공부 요약만 보여주는 **읽기 전용 블로그**다. 공부 대화는 로컬에서만 한다.

- 로컬: `.env.local`의 `AUTH_PROVIDER=siwc` — ChatGPT 플랜으로 공부하고 같은 Supabase DB에 저장한다.
- 배포: 방문자는 로그인 없이 개요·기록(제목·날짜·요약)만 본다. 원본 대화, 진행 중 노트, 초안은 공개하지 않는다(`/api/public`, `lib/public-blog.ts`). 배우는 중(채팅) 화면, `/api/chat`, Gemini 연결은 사이트에서 꺼져 있다.
- Vercel 환경변수 `SITE_OWNER_USER_ID`: 블로그에 보여줄 소유자의 `study.users.id`.
- 내 ChatGPT 사용자와 Google 사용자를 한 소유자로 합치기(기본은 확인만):

```sh
node --conditions=react-server --experimental-strip-types scripts/merge-owner.mjs you@gmail.com
node --conditions=react-server --experimental-strip-types scripts/merge-owner.mjs you@gmail.com --apply
```
