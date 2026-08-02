import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';

export const createPrismaClient = (databaseUrl: string) => {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
};

export type TaskforgePrismaClient = ReturnType<typeof createPrismaClient>;

export const prisma = createPrismaClient(env.DATABASE_URL);

export const connectDatabase = async (client: TaskforgePrismaClient = prisma): Promise<void> => {
  try {
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
  } catch (error) {
    await client.$disconnect().catch(() => undefined);
    throw error;
  }
};

export const disconnectDatabase = async (client: TaskforgePrismaClient = prisma): Promise<void> => {
  await client.$disconnect();
};
