import { createAuthClient } from 'better-auth/react';
import { polarClient } from '@polar-sh/better-auth';
import { organizationClient } from 'better-auth/client/plugins'; 

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL!,
  plugins: [polarClient()],
});

export const { 
  signIn, 
  signOut, 
  signUp, 
  useSession,
  getSession
} = authClient;