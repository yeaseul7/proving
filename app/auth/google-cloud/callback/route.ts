import { NextResponse } from 'next/server';
import { getAuth, requireIdentity } from '@/lib/auth';
import { finishCloudAuthorization } from '@/lib/google-cloud-ai';
import { siteUrl } from '@/lib/site';

export async function GET(request: Request) {
  try {
    getAuth().checkRequest(request);
    const identity = await requireIdentity();
    await finishCloudAuthorization(identity.accountKey, new URL(request.url).searchParams);
    return NextResponse.redirect(new URL('/', siteUrl));
  } catch {
    return NextResponse.redirect(new URL('/?cloud_error=callback', siteUrl));
  }
}
