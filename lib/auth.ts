import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

import { polar, checkout, portal, usage } from '@polar-sh/better-auth';
import { Polar } from '@polar-sh/sdk';

const isSandbox = process.env.IS_SANDBOX === 'true';

const polarClient = new Polar({
  accessToken: isSandbox 
    ? process.env.POLAR_ACCESS_TOKEN_SANDBOX 
    : process.env.POLAR_ACCESS_TOKEN,
  ...(isSandbox && { server: 'sandbox' })
});

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
  plugins: [
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            {
              productId: isSandbox 
                ? (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_SANDBOX_10K || '')
                : (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_10K || ''),
              slug: 'Credits-10000', // Custom slug for easy reference in Checkout URL, e.g. /checkout/Credits-10000
            },
            {
              productId: isSandbox 
                ? (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_SANDBOX_20K || '')
                : (process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_20K || ''),
              slug: 'Credits-20000', // Custom slug for easy reference in Checkout URL, e.g. /checkout/Credits-10000
            },
          ],
          successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
          authenticatedUsersOnly: true,
        }),
        portal(),
        usage(),
      ],
    }),
  ],
  user: {
    deleteUser: {
      enabled: true,
      afterDelete: async (user, request) => {
        await polarClient.customers.deleteExternal({
          externalId: user.id,
        });
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;