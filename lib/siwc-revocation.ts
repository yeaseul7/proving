const issuer='https://auth.openai.com';
// 주입 가능한 의존성으로 실제 토큰 없이 재시도 정책을 검증한다.
export async function revokeSession(refresh:string|undefined,client:string,fetcher:typeof fetch=fetch,pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<boolean>{
  if(!refresh)return false;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const discovery=await fetcher(`${issuer}/.well-known/openid-configuration`,{cache:'no-store',signal:AbortSignal.timeout(4000),redirect:'error'});
      if(!discovery.ok){if(discovery.status<500)return false;throw new Error('discovery');}
      const config=await discovery.json();
      const endpoint=new URL(config.revocation_endpoint);
      if(endpoint.origin!==issuer||endpoint.username||endpoint.password)return false;
      const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:refresh,token_type_hint:'refresh_token',client_id:client}),signal:AbortSignal.timeout(4000),redirect:'error'});
      if(response.status===200)return true;
      if(response.status<500)return false;
    }catch{/* 네트워크/5xx만 제한적으로 재시도하며 토큰과 오류 본문은 로깅하지 않는다. */}
    if(attempt<2)await pause(250*2**attempt);
  }
  return false;
}
