-- proving: 로그인 공급자별 신원 연결과 로컬 학습 앱 기기 연결.
-- 설계: docs/auth-ai-separation.md. 기존 테이블의 행은 삭제하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(18051003);

-- 한 사용자에 여러 로그인(로컬 ChatGPT, 배포 Google)을 연결한다. account_key = sha256(issuer:subject)
CREATE TABLE study.user_identities (
  user_id uuid NOT NULL REFERENCES study.users(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('chatgpt', 'google')),
  account_key text NOT NULL CHECK (account_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, account_key)
);
CREATE INDEX user_identities_user_idx ON study.user_identities(user_id);
INSERT INTO study.user_identities (user_id, provider, account_key, created_at)
SELECT id, 'chatgpt', oauth_account_id, created_at FROM study.users;
-- Google로만 가입한 사용자는 ChatGPT 계정 키가 없다. 기존 행과 UNIQUE·형식 제약은 유지한다.
ALTER TABLE study.users ALTER COLUMN oauth_account_id DROP NOT NULL;

-- 로컬 학습 앱이 배포 사이트 동기화 API에 쓰는 기기별 토큰. 원문은 저장하지 않는다.
CREATE TABLE study.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES study.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX devices_user_idx ON study.devices(user_id, created_at DESC);

-- 1회용 연결 코드. 10분 안에 한 번만 쓸 수 있다.
CREATE TABLE study.link_codes (
  code_hash text PRIMARY KEY CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES study.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX link_codes_user_idx ON study.link_codes(user_id, created_at DESC);

REVOKE ALL ON study.user_identities, study.devices, study.link_codes FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE study.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE study.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE study.link_codes ENABLE ROW LEVEL SECURITY;

COMMIT;
