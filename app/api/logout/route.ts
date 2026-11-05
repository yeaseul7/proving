import { errorResponse } from '@/lib/siwc-errors';
import { NextResponse } from 'next/server';
import { assertLocal, COOKIE, logout } from '@/lib/chat-auth';
export async function POST(request:Request){
  try{assertLocal(request,true);const result=await logout();const response=NextResponse.json({signedOut:true,...result});response.cookies.delete(COOKIE);return response;}catch(error){return errorResponse(error);}
}
