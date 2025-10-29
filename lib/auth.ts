import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

import {
  polar,
  checkout,
  portal,
  usage,
  webhooks,
} from '@polar-sh/better-auth';
import { Polar } from '@polar-sh/sdk';

const polarClient = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN_SANDBOX,
  server: 'sandbox',
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
              productId: process.env.POLAR_PRODUCT_ID_SANDBOX || '',
              slug: 'Credits-10000', // Custom slug for easy reference in Checkout URL, e.g. /checkout/Credits-10000
            },
            // {
            //   productId: 'ee6d8cdb-5dd9-4cdf-b541-c4bdee0a9a7c', // 10k Credits Product ID from Polar Dashboard
            //   slug: '10k-credits', // Custom slug for easy reference in Checkout URL
            // },
          ],
          successUrl: '/success?checkout_id={CHECKOUT_ID}',
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