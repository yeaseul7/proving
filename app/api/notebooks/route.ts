import { notebookApi } from '@/lib/notebook-server';

export const runtime = 'nodejs';
export const GET = notebookApi.list;
export const POST = notebookApi.create;
