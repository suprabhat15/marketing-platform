import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
  },
  socialProviders: {
    google: { 
      clientId: process.env.GOOGLE_CLIENT_ID as string, 
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirectURI: `${process.env.BETTER_AUTH_URL}/api/auth/callback/google`,
    }, 
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  },
  basePath: '/api/auth',
  baseURL: process.env.BETTER_AUTH_URL as string,
});

export type Session = typeof auth.$Infer.Session;
// export type User = typeof auth.$Infer.User;