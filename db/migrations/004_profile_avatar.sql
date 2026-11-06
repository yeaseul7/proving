-- proving: 프로필 사진. 브라우저에서 256px로 줄인 JPG·PNG·WebP data URL만 저장한다(SVG 불가).
-- 기존 행과 소개글 길이 제약(5000자)은 그대로 두고, 설명 500자 제한은 API에서 검사한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(18051004);

ALTER TABLE study.profiles ADD COLUMN avatar text
  CONSTRAINT profiles_avatar_check CHECK (avatar IS NULL OR (
    char_length(avatar) <= 200000 AND avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$'));

COMMIT;
