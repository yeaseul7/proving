import { NextResponse } from 'next/server';
import { COOKIE, SESSION_MAX_AGE_SECONDS, REGISTRATION_COOKIE, finishLogin, localOrigin, TRANSACTION_COOKIE } from '@/lib/chat-auth';
export async function GET(request:Request){
  let result:Awaited<ReturnType<typeof finishLogin>>;
  try {result=await finishLogin(request);}catch{
    const response=NextResponse.redirect(new URL('/?auth_error=callback',localOrigin(request)));response.cookies.delete(TRANSACTION_COOKIE);return response;
  }
  const response=NextResponse.redirect(new URL('/',localOrigin(request)));
  response.cookies.set(COOKIE,result.sessionId,{httpOnly:true,sameSite:'lax',path:'/',maxAge:SESSION_MAX_AGE_SECONDS});
  response.cookies.set(REGISTRATION_COOKIE,result.registration,{httpOnly:true,sameSite:'lax',path:'/',maxAge:365*24*60*60});
  response.cookies.delete(TRANSACTION_COOKIE);response.headers.set('Cache-Control','no-store');return response;
}
