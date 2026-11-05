import { getAuth } from '@/lib/auth';

export const POST = (request: Request) => getAuth().logout(request);
