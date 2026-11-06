import { cloudResponder, CloudAiError } from '@/lib/google-cloud-ai';
import { errorResponse } from '@/lib/siwc-errors';
import { getAuth, requireIdentity } from '@/lib/auth';
import { getAi } from '@/lib/ai';
import { apiMessages, validMessages, validStoredMessages } from '@/lib/chat';
import { cleanTitle, studyInstructions, titleInstructions } from '@/lib/prompts';
const busy=new Set<string>();
export async function POST(request:Request){
  let lock:string|undefined;
  try{
    getAuth().checkRequest(request,true);
    const identity=await requireIdentity();
    if(busy.has(identity.accountKey))return Response.json({error:'앞선 응답이 완료된 뒤 다시 보내주세요.'},{status:429});
    const raw=await request.text();if(raw.length>2000000)return Response.json({error:'대화가 너무 깁니다. 새 공부를 시작해주세요.'},{status:413});
    const body=JSON.parse(raw);
    if(body.account!==identity.accountKey)return Response.json({error:'로그인 계정이 변경되었습니다. 새로고침해주세요.'},{status:409});
    if(body.summarize!==true&&raw.length>150000)return Response.json({error:'대화가 너무 깁니다. 새 공부를 시작해주세요.'},{status:413});
    const validHistory = body.summarize === true
      ? validStoredMessages(body.messages) && body.messages.length > 0
      : validMessages(body.messages);
    if(!validHistory||typeof body.model!=='string'||body.model.length>120)return Response.json({error:'질문과 모델을 확인해주세요.'},{status:400});
    let respond;
    if (body.model.startsWith('cloud:')) {
      respond = await cloudResponder(identity.accountKey);
    } else {
      const ai = getAi();
      await ai.prepare();
      respond = ai.respond.bind(ai);
    }
    if(busy.has(identity.accountKey))return Response.json({error:'앞선 응답이 완료된 뒤 다시 보내주세요.'},{status:429});
    lock=identity.accountKey;busy.add(identity.accountKey);
    const text=await respond({model:body.model,messages:apiMessages(body.messages),timeoutMs:120_000,instructions:studyInstructions(body.language==='en'?'en':'ko',body.summarize===true)});
    let title:string|undefined;
    if(body.generateTitle===true&&!body.summarize&&body.messages.length===1){
      try{
        title=cleanTitle(await respond({model:body.model,messages:[{role:'user',content:body.messages[0].content}],timeoutMs:15_000,instructions:titleInstructions(body.language==='en'?'en':'ko')}));
      }catch{/* The completed study reply still succeeds if naming fails. */}
    }
    return Response.json({text,title,account:identity.accountKey},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if (error instanceof CloudAiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    return errorResponse(error);
  }
  finally{if(lock)busy.delete(lock);}
}
