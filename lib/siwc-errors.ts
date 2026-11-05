export type Recovery = 'reauth' | 'permission' | 'usage' | 'retry';
export function recoveryFor(status:number,code?:string):Recovery {
  if(code==='invalid_grant'||code==='invalid_token'||code==='direct_scope_missing'||status===401)return 'reauth';
  if(status===429||code==='subscription_sharing_usage_limit_exceeded')return 'usage';
  if(status===403)return 'permission';
  return 'retry';
}
export class SiwcError extends Error {
  status:number; code?:string; requestId?:string; param?:string;
  constructor(status:number,code?:string,requestId?:string,param?:string){
    super(status===401?'로그인 권한이 만료되었거나 철회되었습니다. 다시 인증해주세요.':status===403?'계정 또는 워크스페이스 정책으로 요청이 허용되지 않습니다.':status===429?'사용량 제한에 도달했습니다. 사용량 설정을 확인해주세요.':'일시적으로 응답을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
    this.status=status;this.code=code;this.requestId=requestId;this.param=param;
  }
}
// 원문 오류 메시지에는 사용자 입력이나 인증 정보가 포함될 수 있어 전달하지 않는다.
export async function upstreamError(response:Response):Promise<SiwcError>{
  const body=await response.json().catch(()=>null);
  const raw=typeof body?.error==='string'?body.error:body?.error?.code;
  const code=typeof raw==='string'&&/^[a-zA-Z0-9_.-]{1,160}$/.test(raw)?raw:undefined;
  const rawParam=body?.error?.param;
  const param=typeof rawParam==='string'&&/^[a-zA-Z0-9_.\[\]-]{1,100}$/.test(rawParam)?rawParam:undefined;
  return new SiwcError(response.status,code,response.headers.get('x-request-id')??undefined,param);
}
export function errorResponse(error:unknown){
  const e=error instanceof SiwcError?error:new SiwcError(503);
  return Response.json({error:e.message,code:e.code,param:e.param,requestId:e.requestId,recovery:recoveryFor(e.status,e.code)},{status:e.status,headers:{'Cache-Control':'no-store'}});
}
