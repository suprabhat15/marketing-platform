// Lightweight auth module for API routes
import { NextRequest } from 'next/server';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: SessionUser;
}

// Cache auth import to avoid loading it multiple times
let authModule: any = null;

export async function getSession(request: NextRequest): Promise<AuthSession | null> {
  try {
    if (!authModule) {
      authModule = await import('@/lib/auth');
    }
    
    return await authModule.auth.api.getSession({
      headers: request.headers,
    });
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export async function requireAuth(request: NextRequest): Promise<AuthSession> {
  const session = await getSession(request);
  if (!session || !session.user || !session.user.id) {
    throw new Error('Unauthorized');
  }
  return session;
}