export type Profile = { handle: string | null; displayName: string | null; avatar: string | null; intro: string; isPublic: boolean };
export type ProfileInput = Pick<Profile, 'displayName' | 'avatar' | 'intro'>;
export type PublicProfile = { handle: string; displayName: string; avatar: string | null; intro: string; updatedAt: string; counts: Record<string, number> };

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const NAME_MAX = 40;
export const INTRO_MAX = 500;
// 프로필 사진은 브라우저에서 256px로 줄인 data URL로 저장한다. SVG는 받지 않는다.
export const AVATAR_SIZE = 256;
export const AVATAR_MAX = 200_000;
export const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const EMPTY_PROFILE: Profile = { handle: null, displayName: null, avatar: null, intro: '', isPublic: false };

// 편집 화면에서 바꿀 수 있는 이름·사진·설명만 정리한다. 실패 시 사용자에게 보여줄 문구를 반환한다.
export function parseProfileInput(input: unknown): ProfileInput | string {
  if (!input || typeof input !== 'object') return '프로필 입력이 올바르지 않습니다.';
  const { displayName, avatar, intro } = input as Record<string, unknown>;
  if (displayName != null && typeof displayName !== 'string') return '이름이 올바르지 않습니다.';
  if (avatar != null && typeof avatar !== 'string') return '프로필 사진이 올바르지 않습니다.';
  if (typeof intro !== 'string') return '프로필 입력이 올바르지 않습니다.';
  const cleanName = displayName?.trim() || null;
  const cleanAvatar = avatar || null;
  if (cleanName && Array.from(cleanName).length > NAME_MAX) return `이름은 ${NAME_MAX}자까지 쓸 수 있어요.`;
  if (cleanAvatar && (cleanAvatar.length > AVATAR_MAX || !AVATAR_PATTERN.test(cleanAvatar))) return '프로필 사진은 JPG·PNG·WebP 이미지만 올릴 수 있어요.';
  if (Array.from(intro).length > INTRO_MAX) return `설명은 ${INTRO_MAX}자까지 쓸 수 있어요.`;
  return { displayName: cleanName, avatar: cleanAvatar, intro };
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
