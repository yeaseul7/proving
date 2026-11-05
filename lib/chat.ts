import { SiwcError } from './siwc-errors.ts';
export type AiVendor='openai'|'anthropic'|'gemini';
// provider는 답변 아바타용 브라우저 표시 정보다. 서버 DB에는 저장하지 않으며 AI API로 보내기 전에 apiMessages로 뺀다.
export type ChatMessage={role:'user'|'assistant';content:string;provider?:AiVendor};
export const apiMessages=(messages:ChatMessage[])=>messages.map(({role,content})=>({role,content}));
// 서버에서 받은 노트에는 provider가 없으므로 같은 위치의 같은 메시지면 브라우저 값을 이어 붙인다.
export function keepProviders(messages:ChatMessage[],cached:ChatMessage[]):ChatMessage[]{
  return messages.map((m,i)=>{const c=cached[i];return c?.provider&&c.role===m.role&&c.content===m.content?{...m,provider:c.provider}:m;});
}
export function validMessages(value:unknown):value is ChatMessage[]{
  return Array.isArray(value)&&value.length>0&&value.length<=100&&value.every(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.trim().length>0&&m.content.length<=20000)&&value.reduce((n,m)=>n+m.content.length,0)<=100000;
}
export function validStoredMessages(value: unknown): value is ChatMessage[] {
  return Array.isArray(value) && value.length <= 101 &&
    value.every(message => message && ['user', 'assistant'].includes(message.role) &&
      typeof message.content === 'string' && message.content.trim() &&
      message.content.length <= 200000 && !message.content.includes('\0')) &&
    value.reduce((length, message) => length + message.content.length, 0) <= 300000;
}
export async function readResponse(stream:ReadableStream<Uint8Array>):Promise<string>{
  const reader=stream.getReader();const decoder=new TextDecoder();let buffer='',text='',completed=false;
  try {
    while(true){
      const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
      buffer=buffer.replaceAll('\r\n','\n');
      let end:number;
      while((end=buffer.indexOf('\n\n'))!==-1){
        const block=buffer.slice(0,end);buffer=buffer.slice(end+2);
        const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
        if(!data||data==='[DONE]')continue;
        const event=JSON.parse(data);
        if(event.type==='response.output_text.delta'&&typeof event.delta==='string')text+=event.delta;
        if(text.length>200000)throw new Error('응답이 너무 깁니다. 질문 범위를 줄여주세요.');
        if(['response.failed','response.incomplete','error'].includes(event.type)){const code=event.response?.error?.code??event.error?.code??event.code;throw new SiwcError(code==='subscription_sharing_usage_limit_exceeded'?429:code==='subscription_sharing_invalid_user'?401:code==='subscription_sharing_user_not_eligible'||code==='chatpass_v2_scope_not_authorized'||code==='chatpass_v2_invalid_authorization_context'?403:503,typeof code==='string'&&/^[a-zA-Z0-9_.-]{1,160}$/.test(code)?code:undefined);};
        if(event.type==='response.completed')completed=true;
      }
      if(buffer.length>500000)throw new Error('응답 형식을 읽지 못했습니다.');
      if(done)break;
    }
    if(!completed||!text.trim())throw new Error('응답이 중단되었습니다. 다시 시도해주세요.');
    return text;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
