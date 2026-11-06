import { NextResponse } from 'next/server';
import { getAuth, requireIdentity } from '@/lib/auth';
import { beginCloudAuthorization } from '@/lib/google-cloud-ai';
import { siteUrl } from '@/lib/site';

export async function GET(request: Request) {
  try {
    getAuth().checkRequest(request);
    const identity = await requireIdentity();
    const response = NextResponse.redirect(await beginCloudAuthorization(identity.accountKey, new URL(request.url).searchParams.get('project')));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.redirect(new URL('/?cloud_error=start', siteUrl));
  }
}
