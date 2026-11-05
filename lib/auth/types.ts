import type { IdentityProvider } from '../study-users.ts';

// 로그인한 사용자. 브라우저가 보낸 값이 아니라 서버가 검증한 세션에서만 만든다.
export type Identity = {
  provider: IdentityProvider;
  // sha256(issuer:subject). 브라우저 저장소 키, 요청 계정 확인, study.user_identities 연결에 쓴다.
  accountKey: string;
  name: string;
};

export interface AuthProvider {
  readonly provider: IdentityProvider;
  // 요청 출처 검사. 실패 시 SiwcError(403)를 던진다.
  checkRequest(request: Request, mutation?: boolean): void;
  getIdentity(): Promise<Identity | null>;
  startLogin(request: Request): Promise<Response>;
  finishLogin(request: Request): Promise<Response>;
  logout(request: Request): Promise<Response>;
}
