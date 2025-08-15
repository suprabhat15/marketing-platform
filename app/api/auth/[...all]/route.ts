import { auth } from '@/lib/auth';

// Better Auth provides a single handler that manages all HTTP methods internally
export async function GET(request: Request) {
  return auth.handler(request);
}

export async function POST(request: Request) {
  return auth.handler(request);
}