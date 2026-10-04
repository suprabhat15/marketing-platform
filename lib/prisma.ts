import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';

const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
};

const prisma =
  globalForPrisma.prisma || new PrismaClient().$extends(withAccelerate());

  console.log('=== PRISMA RUNTIME DIAGNOSTIC ===');

  try {
    const location = await prisma.$queryRaw<
      Array<{
        database: string;
        schema: string;
        user: string;
      }>
    >`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        current_user AS user
    `;

    console.log('PRISMA LOCATION:', location);

    const user = await prisma.user.findFirst();
    console.log('PRISMA USER TEST:', !!user);

    const subscription = await prisma.subscription.findFirst();
    console.log('PRISMA SUBSCRIPTION TEST:', !!subscription);
  } catch (e) {
    console.error('PRISMA RUNTIME ERROR:', e);
  }

globalForPrisma.prisma = prisma;

export { prisma };
