# proving 데이터베이스

`study`는 Next.js의 서버 전용 `pg` 연결로만 사용하는 스키마다. OAuth·토큰 저장은 기존 로컬 파일 방식을 유지한다. 프론트엔드의 localStorage 기록은 아직 자동 이전하지 않는다.

## 마이그레이션

```sh
# 최초 적용: 검증까지 통과한 경우에만 커밋
node --conditions=react-server --experimental-strip-types scripts/db-schema.mjs --apply

# 적용 후 테이블·RLS·권한·타입·행 개수 확인 (읽기 전용)
node --conditions=react-server --experimental-strip-types scripts/db-schema.mjs
```

`.env.local`의 기존 `DATABASE_URL`, `SUPABASE_CA_PATH`와 `lib/db.ts`를 사용한다. 인증 정보는 출력하지 않는다. 적용 시 `study` 스키마가 이미 있으면 중단하며, 수정·삭제·재초기화하지 않는다. 이후 변경은 `002_...sql` 등 후속 마이그레이션으로 처리한다. SQL 파일은 자체 트랜잭션도 포함하므로 SQL 클라이언트에서 독립 실행할 수 있다.

검증 데이터는 SAVEPOINT 내에서만 생성하고 전부 롤백한다. 소유권 외래키, 메시지 키·순서 중복, 기록 중복, JSONB 형태, 원본 메시지와 기록의 노트 일치를 검사한다. 적용 과정에서 오류가 나면 전체 DDL도 롤백한다. 진단에는 SQLSTATE·제약 이름·테이블 등만 포함하며, 원문 오류의 입력값·상세 행·접속 주소는 생략한다.

## 관계와 중복 방지

- `users`: UUID 내부 키와 기존 OAuth `account` 해시의 고유 매핑. 토큰·비밀번호·Client Secret 컬럼은 없다.
- `notebooks`: 사용자 소유 노트와 초안. `active`/`archived`로 상태를 구분한다.
- `messages`: 노트의 대화. `(notebook_id, user_id)` 복합 외래키가 소유자 불일치를 거부한다. 재전송 시 같은 `client_message_id`를 사용한다. 본문이 같아도 별도의 질문은 허용한다.
- `study_records`: 노트당 하나의 기록. 반복 요약은 같은 기록을 갱신하고 `revision`을 증가시킨다. `(user_id, idempotency_key)`로 동일 저장 요청의 중복 생성을 차단한다.
- `record_messages`: 기록 시점의 원문 스냅샷. 기록과 메시지 모두 같은 사용자·노트에 속해야 한다. 같은 원본 메시지 또는 순서를 한 기록에 중복 등록할 수 없다. 스냅샷은 API에서 원본 메시지를 SELECT해 복사해야 한다.

JSONB 기본 형식:

```json
{"schema_version":1,"markdown":"## 핵심 개념\n\n학습 요약"}
```

유효한 객체·버전·비어 있지 않은 Markdown을 CHECK로 검증한다. 복습 질문 등 추가 JSON 필드는 추후 추가할 수 있다. 현재 화면의 문자열 요약도 위 형식으로 감싸면 저장할 수 있다.

모든 외래키는 `ON DELETE RESTRICT`다. 노트를 닫을 때는 보관 상태로 바꾸며 기록 원본을 연쇄 삭제하지 않는다. 삭제 API에는 명시적인 트랜잭션 설계가 필요하다. `updated_at`, `revision`, 메시지 순서 할당은 추후 API가 트랜잭션으로 관리한다. 최대 활성 노트 3개 제한은 사용자 행 잠금 등을 이용해 API에서 동시성까지 처리해야 한다.

## 접근 제어

- Supabase Dashboard → API → Exposed schemas에 `study`를 추가하지 않는다.
- `PUBLIC`, `anon`, `authenticated`, `service_role`에 스키마·테이블 접근 권한을 주지 않는다. 모든 테이블에 RLS를 켜고 Data API용 정책을 생성하지 않는다.
- PostgreSQL에서 확인 가능한 PostgREST 설정에 `study`가 있으면 적용기가 중단한다. 설정을 DB에서 조회할 수 없는 경우 대시보드의 노출 목록은 별도 확인해야 한다. 권한 차단과 노출 목록 설정은 서로 다른 조치다.
- 테이블 소유자/관리자 DB 연결은 RLS를 우회할 수 있다. API는 반드시 서버 세션의 account로 사용자를 찾고 모든 쿼리를 `user_id`로 제한해야 한다. 클라이언트가 보낸 user_id를 신뢰하지 않는다.
- 이 설계는 서버 API를 위한 기반이며 브라우저의 Supabase Data API 직접 접근을 지원하지 않는다.

## 다음 API 구현 순서

1. 기존 서버 세션으로 `users`를 조회하거나 생성하는 서버 전용 함수 — 완료
2. `GET/POST /api/notebooks`, `GET/PATCH /api/notebooks/:id`: 목록·생성·상세·제목·보관 — 완료. [노트 API 명세](notebooks-api.md)
3. 기존 `/api/chat`에 메시지 저장 연결: 질문을 먼저 저장하고 답변 완료 후 저장; 안정적인 메시지 UUID로 재시도
4. `POST /api/study-records`: 요약 완료 후 기록·원문 스냅샷을 한 트랜잭션에 저장
5. `GET /api/study-records`, `GET /api/study-records/:id`: 기록 목록·상세
6. 별도 localStorage 가져오기 API: 사용자 확인, UUID 매핑·중복 방지 후 이전

DB UNIQUE는 중복 저장을 차단하지만 중복 GPT 호출 자체는 차단하지 않는다. 추론 요청의 동시 실행과 재시도 멱등성은 API 단계에서 별도로 구현한다. 이번 마이그레이션은 댓글·조회수 저장 기능을 추가하지 않는다.
