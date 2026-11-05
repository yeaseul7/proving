import { NextResponse } from 'next/server';
import { localOrigin, startLogin, TRANSACTION_COOKIE } from '@/lib/chat-auth';
export async function GET(request: Request) {
  try {
    const {id,url}=await startLogin(request);
    const response=NextResponse.redirect(url);
    response.cookies.set(TRANSACTION_COOKIE,id,{httpOnly:true,sameSite:'lax',path:'/',maxAge:600});
    response.headers.set('Cache-Control','no-store');return response;
  }catch {return NextResponse.redirect(new URL('/?auth_error=start',localOrigin(request)));}
}
