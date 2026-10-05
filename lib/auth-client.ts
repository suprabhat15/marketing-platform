import { createAuthClient } from 'better-auth/react';
import { polarClient } from '@polar-sh/better-auth';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL!,
  plugins: [polarClient()],
});

export const { 
  deleteUser,
  signIn, 
  signOut, 
  signUp, 
  useSession,
  getSession
} = authClient;
