import { errorResponse } from '@/lib/siwc-errors';
import { getAuth } from '@/lib/auth';
import { getAi } from '@/lib/ai';
export async function GET(request:Request){
  try{
    getAuth().checkRequest(request);
    return Response.json({models:await getAi().listModels()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return errorResponse(error);}
}
