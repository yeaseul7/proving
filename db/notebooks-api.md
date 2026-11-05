# 공부 노트 API

이 API는 기존 `study-session` 쿠키와 검증된 서버 세션을 사용한다. 쿠키나 요청 본문의 사용자 값을 DB 소유자로 쓰지 않는다. 검증된 세션의 `account`를 세션 `subject`에서 다시 계산한 해시와 대조하고 `study.users.oauth_account_id`에 연결한다. 연결된 사용자 행이 없으면 생성하며, 식별자가 비어 있거나 일치하지 않으면 `401`을 반환한다. GPT 플랜 권한 확인 및 토큰 갱신은 하지 않는다.

모든 요청은 기존 `127.0.0.1` 로컬 실행 조건을 따른다. `POST`, `PATCH`에는 요청 URL과 일치하는 `Origin` 및 `Content-Type: application/json`이 필요하다. 최대 JSON 본문은 4096바이트다. 응답은 `Cache-Control: no-store`이며 계정 해시·OAuth 토큰·내부 사용자 UUID는 반환하지 않는다.

| 메서드 | 경로 | 요청 | 성공 |
| --- | --- | --- | --- |
| POST | `/api/notebooks` | `{ "id": "<UUID>", "title": "<선택>" }` | `201 { notebook }` 및 `Location`; 기존 소유 UUID 재전송은 `200 { notebook }` |
| GET | `/api/notebooks` | 선택 쿼리 `status=active\|archived`, `limit=1..100`, `offset=0..10000` | `200 { notebooks, limit, offset, hasMore }` |
| GET | `/api/notebooks/:id` | 경로의 노트 UUID | `200 { notebook }` |
| PATCH | `/api/notebooks/:id` | `{ "title": "<제목>", "status": "active\|archived" }` 중 하나 이상 | `200 { notebook }` |

`notebook` 필드: `id`, `title`, `status`, `studyDate` (`YYYY-MM-DD`), `draft`, `createdAt`, `updatedAt`. 시각 필드는 ISO 8601 문자열이다. 생성 시 생략한 제목은 `제목 없는 노트`, 상태는 `active`다. 제목은 앞뒤 공백을 제거한 뒤 1~100자여야 한다. 목록은 기본 50개, 최신 수정순이며 상태를 지정하지 않으면 보관 노트도 포함한다. `draft`는 이번 API에서 읽기만 지원한다. 메시지와 학습 기록은 반환하지 않는다.

생성하는 쪽에서 `crypto.randomUUID()`로 UUID를 한 번 만들고 실패·타임아웃 후 재전송에도 같은 UUID를 사용한다. 동일 소유자의 UUID가 이미 있으면 제목 등을 덮어쓰지 않고 현재 값을 반환한다. 기존 상태와 같은 PATCH는 수정 시각을 바꾸지 않는다. 생성과 보관 해제는 트랜잭션에서 사용자 행을 잠가 활성 노트 3개 제한을 유지한다. 아직 DELETE는 지원하지 않으며 `archived`는 DB 행이나 대화의 삭제가 아니다.

| 상태 | 코드 또는 조건 |
| --- | --- |
| 400 | `invalid_input`: UUID·입력 필드·제목·상태·페이지 범위 오류 |
| 401 | `authentication_required`: 세션 없음·만료·계정 식별자 불일치 |
| 403 | `invalid_origin`: 로컬 Host 또는 변경 요청 Origin 검증 실패 |
| 404 | `notebook_not_found`: 없는 노트 또는 타인 소유 노트 |
| 409 | `active_notebook_limit` 또는 `notebook_id_conflict` |
| 413 | `body_too_large` |
| 415 | `unsupported_media_type` |
| 503 | `notebook_service_unavailable`: 내부 DB·세션 처리 실패 |

오류 응답 형식은 `{ "code": "...", "message": "..." }`다. DB 오류 원문·인증 정보를 로그나 응답으로 노출하지 않는다. 내부 사용자 조회와 모든 노트 쿼리에 바인딩 파라미터를 사용한다. 테이블 소유자 연결은 RLS를 우회할 수 있으므로 상세 조회와 수정의 SQL에 UUID와 `user_id`를 함께 조건으로 사용한다.

```sh
npm test
npm run typecheck
node --conditions=react-server --experimental-strip-types --test tests/notebook-api-db.integration.ts
```

통합 테스트는 실제 PostgreSQL에 접속하되 테스트용 사용자를 주입해 핸들러를 검증하며, 모든 테스트 행을 롤백한다. 실제 OpenAI 로그인이나 GPT 호출을 실행하지 않는다. 기존 마이그레이션·OAuth 토큰 저장·브라우저 localStorage 및 화면 동작은 그대로 유지한다.
