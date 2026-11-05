import { getAuth } from '@/lib/auth';

export const GET = (request: Request) => getAuth().finishLogin(request);
