-- proving: 사용자별 공개 프로필. 아이디와 공개 여부를 정한 사용자만 /u/<handle>로 공개한다.
-- 이미 profiles 테이블이 있으면 오류로 중단하며 덮어쓰거나 삭제하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(18051002);

CREATE TABLE study.profiles (
  user_id uuid PRIMARY KEY REFERENCES study.users(id) ON DELETE RESTRICT,
  -- URL에 쓰는 아이디. 소문자로만 저장해 대소문자만 다른 중복을 막는다.
  handle text UNIQUE CHECK (handle IS NULL OR handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 40),
  intro_markdown text NOT NULL DEFAULT '' CHECK (char_length(intro_markdown) <= 5000),
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at),
  CHECK (NOT is_public OR handle IS NOT NULL)
);

REVOKE ALL ON study.profiles FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE study.profiles ENABLE ROW LEVEL SECURITY;

COMMIT;
