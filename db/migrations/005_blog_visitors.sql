BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(18051005);

CREATE TABLE IF NOT EXISTS study.blog_visitors (
  owner_id uuid NOT NULL REFERENCES study.users(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL,
  last_visit date NOT NULL,
  PRIMARY KEY (owner_id, visitor_id)
);
CREATE INDEX IF NOT EXISTS blog_visitors_owner_date_idx ON study.blog_visitors (owner_id, last_visit);
ALTER TABLE study.blog_visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON study.blog_visitors FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
