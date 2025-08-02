// import { PrismaClient } from '@prisma/client';


// let prisma: PrismaClient;
// try {
//   prisma = new PrismaClient();
//   console.info('Prisma initialized');
// } catch (error) {
//   console.error('Failed to initialize Prisma: ', error);
// }

import { PrismaClient } from '@prisma/client/edge'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient().$extends(withAccelerate())
export { prisma };

