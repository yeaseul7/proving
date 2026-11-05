import { assertLocal, getSession } from '@/lib/chat-auth';
export async function GET(request:Request){
  try{assertLocal(request);const s=await getSession();return Response.json(s?{account:s.account,name:s.name,canChat:s.scopes.includes('chatgpt.tokens.use.direct')}:{account:null},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({account:null},{status:403});}
}
