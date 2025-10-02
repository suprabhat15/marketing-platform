// Lightweight database client for simple operations
let prismaClient: any = null;

export async function getPrisma() {
  if (!prismaClient) {
    const { prisma } = await import('./prisma');
    prismaClient = prisma;
  }
  return prismaClient;
}

// Common database operations with lazy loading
export async function findUnique(model: string, where: any, include?: any) {
  const prisma = await getPrisma();
  return prisma[model].findUnique({ where, include });
}

export async function findMany(model: string, options: any) {
  const prisma = await getPrisma();
  return prisma[model].findMany(options);
}

export async function create(model: string, data: any, include?: any) {
  const prisma = await getPrisma();
  return prisma[model].create({ data, include });
}

export async function update(model: string, where: any, data: any, include?: any) {
  const prisma = await getPrisma();
  return prisma[model].update({ where, data, include });
}

export async function deleteRecord(model: string, where: any) {
  const prisma = await getPrisma();
  return prisma[model].delete({ where });
}