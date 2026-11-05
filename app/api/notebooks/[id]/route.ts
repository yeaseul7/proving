import { notebookApi } from '@/lib/notebook-server';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return notebookApi.get(request, (await params).id);
}

export async function PATCH(request: Request, { params }: Context) {
  return notebookApi.patch(request, (await params).id);
}
