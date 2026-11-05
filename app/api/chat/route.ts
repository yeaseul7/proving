import { errorResponse } from '@/lib/siwc-errors';
import { getAuth, requireIdentity } from '@/lib/auth';
import { getAi } from '@/lib/ai';
import { validMessages, validStoredMessages } from '@/lib/chat';
const busy=new Set<string>();
export async function POST(request:Request){
  let lock:string|undefined;
  try{
    getAuth().checkRequest(request,true);
    const ai=getAi();
    const identity=await requireIdentity();
    await ai.prepare();
    if(busy.has(identity.accountKey))return Response.json({error:'앞선 응답이 완료된 뒤 다시 보내주세요.'},{status:429});
    const raw=await request.text();if(raw.length>2000000)return Response.json({error:'대화가 너무 깁니다. 새 공부를 시작해주세요.'},{status:413});
    const body=JSON.parse(raw);
    if(body.account!==identity.accountKey)return Response.json({error:'로그인 계정이 변경되었습니다. 새로고침해주세요.'},{status:409});
    if(body.summarize!==true&&raw.length>150000)return Response.json({error:'대화가 너무 깁니다. 새 공부를 시작해주세요.'},{status:413});
    const validHistory = body.summarize === true
      ? validStoredMessages(body.messages) && body.messages.length > 0
      : validMessages(body.messages);
    if(!validHistory||typeof body.model!=='string'||body.model.length>120)return Response.json({error:'질문과 모델을 확인해주세요.'},{status:400});
    lock=identity.accountKey;busy.add(identity.accountKey);
    const text=await ai.respond({model:body.model,messages:body.messages,timeoutMs:120_000,instructions:(body.language==='en'?'Write all replies and study notes in English. ':'한국어로 답변한다. ')+ 'Format code in fenced Markdown blocks with a language identifier. Use $...$ for inline math and $$ on separate lines for display equations. Never put mathematical notation in code fences. '+(body.summarize?'사용자와의 공부 대화를 하나의 Markdown 학습 노트로 정리한다. 노트 제목은 이미 별도로 저장되어 있으므로 제목을 생성하거나 본문에 반복하지 않는다. # 제목 없이 ## 핵심 개념부터 본문을 시작한다. 핵심 개념, 이해가 부족한 부분, 복습 질문을 포함한다. 대화에서 다루지 않은 사실이나 학습 성과를 꾸며내지 않는다. 노트 본문만 출력한다.':'공부 도우미다. 사용자의 이해 수준을 확인하고 개념과 예제를 간결하게 설명한다. 필요한 경우 짧은 복습 질문을 한다. 사실이 불확실하면 명시한다.')});
    let title:string|undefined;
    if(body.generateTitle===true&&!body.summarize&&body.messages.length===1){
      try{
        title=(await ai.respond({model:body.model,messages:[{role:'user',content:body.messages[0].content}],timeoutMs:15_000,instructions:body.language==='en'?'Name this study conversation in 2–6 words based on the user request. Return only the title, without quotes or Markdown. Do not answer the request.':'사용자의 첫 질문을 바탕으로 공부 대화 제목을 15자 내외로 짓는다. 질문에 답하지 말고 따옴표나 Markdown 없이 제목만 출력한다.'})).trim().replace(/^['"#\s]+|['"\s]+$/g,'').slice(0,100);
      }catch{/* The completed study reply still succeeds if naming fails. */}
    }
    return Response.json({text,title,account:identity.accountKey},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
  finally{if(lock)busy.delete(lock);}
}
