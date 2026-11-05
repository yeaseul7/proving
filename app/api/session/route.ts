import { getAuth } from '@/lib/auth';
import { getAi } from '@/lib/ai';
// provider·aiMode는 로그인 전에도 반환해 화면이 로그인 버튼과 안내를 고를 수 있게 한다.
export async function GET(request:Request){
  try{
    const auth=getAuth();auth.checkRequest(request);
    const {mode:aiMode,canChat}=await getAi().status();
    const identity=await auth.getIdentity();
    const base={provider:auth.provider,aiMode};
    if(!identity)return Response.json({account:null,...base},{headers:{'Cache-Control':'no-store'}});
    return Response.json({account:identity.accountKey,name:identity.name,canChat,...base},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({account:null},{status:403});}
}
