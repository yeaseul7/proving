export type Profile = { handle: string | null; displayName: string | null; intro: string; isPublic: boolean };
export type PublicProfile = { handle: string; displayName: string; intro: string; updatedAt: string; counts: Record<string, number> };

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const NAME_MAX = 40;
export const INTRO_MAX = 5000;
// 아직 저장하지 않은 프로필은 공개가 기본이다. 공개하려면 아이디가 필요해 처음 저장할 때 정한다.
export const EMPTY_PROFILE: Profile = { handle: null, displayName: null, intro: '', isPublic: true };

// 브라우저 입력을 DB 제약과 같은 규칙으로 정리한다. 실패 시 사용자에게 보여줄 문구를 반환한다.
export function parseProfileInput(input: unknown): Profile | string {
  if (!input || typeof input !== 'object') return '프로필 입력이 올바르지 않습니다.';
  const { handle, displayName, intro, isPublic } = input as Record<string, unknown>;
  if (handle !== null && typeof handle !== 'string') return '아이디가 올바르지 않습니다.';
  if (displayName !== null && typeof displayName !== 'string') return '이름이 올바르지 않습니다.';
  if (typeof intro !== 'string' || typeof isPublic !== 'boolean') return '프로필 입력이 올바르지 않습니다.';
  const cleanHandle = handle?.trim().toLowerCase() || null;
  const cleanName = displayName?.trim() || null;
  if (cleanHandle && !HANDLE_PATTERN.test(cleanHandle)) return '아이디는 영문 소문자·숫자·밑줄 3~20자로 정해주세요.';
  if (cleanName && Array.from(cleanName).length > NAME_MAX) return `이름은 ${NAME_MAX}자까지 쓸 수 있어요.`;
  if (intro.length > INTRO_MAX) return `소개글은 ${INTRO_MAX}자까지 쓸 수 있어요.`;
  if (isPublic && !cleanHandle) return '프로필을 공개하려면 아이디를 정해주세요.';
  return { handle: cleanHandle, displayName: cleanName, intro, isPublic };
}

// meta description용 평문. Markdown 기호·코드·수식을 걷어내고 길이를 제한한다.
export function introDescription(markdown: string, max = 160): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[`*_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}
