import { getAuth } from '@/lib/auth';
import { getAi } from '@/lib/ai';
export async function GET(request:Request){
  try{
    const auth=getAuth();auth.checkRequest(request);
    const identity=await auth.getIdentity();
    if(!identity)return Response.json({account:null},{headers:{'Cache-Control':'no-store'}});
    const {canChat}=await getAi().status();
    return Response.json({account:identity.accountKey,name:identity.name,canChat},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({account:null},{status:403});}
}
