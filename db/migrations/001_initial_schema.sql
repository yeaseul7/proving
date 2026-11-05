-- proving: 서버의 pg 연결 전용. OAuth 토큰은 이 스키마에 저장하지 않는다.
-- 기존 테이블이 있으면 오류로 중단하며 덮어쓰거나 삭제하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(18051001);
CREATE SCHEMA study;

CREATE TABLE study.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 기존 OAuth의 SHA-256(issuer:sub) account 값. 브라우저가 보낸 값은 신뢰하지 않는다.
  oauth_account_id text NOT NULL UNIQUE CHECK (oauth_account_id ~ '^[a-f0-9]{64}$'),
  display_name text CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

CREATE TABLE study.notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES study.users(id) ON DELETE RESTRICT,
  title text NOT NULL DEFAULT '제목 없는 노트' CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  study_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  draft text NOT NULL DEFAULT '' CHECK (char_length(draft) <= 20000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (updated_at >= created_at)
);
CREATE INDEX notebooks_user_status_updated_idx ON study.notebooks(user_id, status, updated_at DESC);

CREATE TABLE study.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notebook_id uuid NOT NULL,
  -- 재전송에도 같은 UUID를 사용한다. 같은 질문을 다시 하는 것은 허용한다.
  client_message_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 200000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (notebook_id, user_id) REFERENCES study.notebooks(id, user_id) ON DELETE RESTRICT,
  UNIQUE (notebook_id, client_message_id),
  UNIQUE (notebook_id, position),
  UNIQUE (id, notebook_id, user_id)
);

CREATE TABLE study.study_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notebook_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  subject text NOT NULL DEFAULT 'GPT 공부' CHECK (char_length(btrim(subject)) BETWEEN 1 AND 40),
  study_date date NOT NULL,
  -- 기존 Markdown은 {"schema_version":1,"markdown":"..."} 형태로 저장할 수 있다.
  summary jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (notebook_id, user_id) REFERENCES study.notebooks(id, user_id) ON DELETE RESTRICT,
  UNIQUE (notebook_id),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (id, notebook_id, user_id),
  CHECK (jsonb_typeof(summary) = 'object'
    AND summary ? 'schema_version' AND summary->'schema_version' = '1'::jsonb
    AND summary ? 'markdown' AND jsonb_typeof(summary->'markdown') = 'string'
    AND char_length(btrim(summary->>'markdown')) BETWEEN 1 AND 200000),
  CHECK (updated_at >= created_at)
);
CREATE INDEX study_records_user_date_idx ON study.study_records(user_id, study_date DESC, updated_at DESC);

CREATE TABLE study.record_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notebook_id uuid NOT NULL,
  record_id uuid NOT NULL,
  message_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  -- 기록 시점의 원문 스냅샷. 이후 대화 변경과 분리한다.
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 200000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (record_id, notebook_id, user_id)
    REFERENCES study.study_records(id, notebook_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (message_id, notebook_id, user_id)
    REFERENCES study.messages(id, notebook_id, user_id) ON DELETE RESTRICT,
  UNIQUE (record_id, message_id),
  UNIQUE (record_id, position)
);
CREATE INDEX record_messages_source_idx ON study.record_messages(message_id, notebook_id, user_id);

-- Data API에 권한을 주지 않는다. Exposed schemas에 study를 추가하지 않는다.
REVOKE ALL ON SCHEMA study FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA study FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA study FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA study REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA study REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA study REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE study.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE study.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE study.study_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE study.record_messages ENABLE ROW LEVEL SECURITY;
-- 정책 없음: Data API는 거부. 소유자 권한의 pg 서버는 API에서 user_id를 반드시 검사한다.
COMMIT;
