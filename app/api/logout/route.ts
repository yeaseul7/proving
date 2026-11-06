import { getAuth } from '@/lib/auth';
import { clearCloudAuthorization } from '@/lib/google-cloud-ai';

export async function POST(request: Request) {
  const auth = getAuth();
  const response = await auth.logout(request);
  if (response.ok && auth.provider === 'google') await clearCloudAuthorization();
  return response;
}
