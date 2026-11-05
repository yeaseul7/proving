// 로그인한 사용자. 브라우저가 보낸 값이 아니라 서버가 검증한 세션에서만 만든다.
export type Identity = {
  provider: 'chatgpt';
  // sha256(issuer:subject). 브라우저 저장소 키, 요청 계정 확인, study.users 연결에 쓴다.
  accountKey: string;
  name: string;
};

export interface AuthProvider {
  // 요청 출처 검사. 실패 시 SiwcError(403)를 던진다.
  checkRequest(request: Request, mutation?: boolean): void;
  getIdentity(): Promise<Identity | null>;
  startLogin(request: Request): Promise<Response>;
  finishLogin(request: Request): Promise<Response>;
  logout(request: Request): Promise<Response>;
}
