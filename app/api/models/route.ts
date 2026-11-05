import { upstreamError, errorResponse } from '@/lib/siwc-errors';
import { assertLocal, authorizedSession } from '@/lib/chat-auth';
export async function GET(request:Request){
  try{
    assertLocal(request);const s=await authorizedSession();
    const response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${s.access}`},cache:'no-store',signal:AbortSignal.timeout(20_000)});
    if(!response.ok)throw await upstreamError(response);
    const body=await response.json();
    const models=Array.isArray(body.models)?body.models.filter((m:Record<string,unknown>)=>m.visibility==='list'&&typeof m.slug==='string').map((m:Record<string,unknown>)=>({id:m.slug,name:typeof m.display_name==='string'?m.display_name:m.slug})):[];
    return Response.json({models},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}
