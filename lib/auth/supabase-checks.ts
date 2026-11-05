import { SiwcError } from '../siwc-errors.ts';
import { siteUrl } from '../site.ts';

// 베타 기간 가입 허용 목록. 비어 있으면 모든 Google 계정을 허용한다.
export function emailAllowed(email: string | undefined, allowlist = process.env.SIGNUP_ALLOWLIST) {
  const allowed = (allowlist ?? '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean);
  return allowed.length === 0 || Boolean(email && allowed.includes(email.toLowerCase()));
}

// 배포 사이트는 자기 도메인으로 온 요청만 받는다. 쿠키로 인증하는 변경 요청은 같은 Origin이어야 한다.
export function checkSiteRequest(request: Request, mutation = false, site = siteUrl) {
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (host !== site.host) throw new SiwcError(403, 'invalid_origin');
  if (mutation && request.headers.get('origin') !== site.origin) throw new SiwcError(403, 'invalid_origin');
}
