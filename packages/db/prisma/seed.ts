import argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const seedKey = 'phase-0-seed-v1';

  const existing = await prisma.seedMarker.findUnique({
    where: { key: seedKey },
  });

  if (existing) {
    console.log('Seed already applied.');
    return;
  }

  const adminHash = await argon2.hash('AdminPass123!', { type: argon2.argon2id });
  const customerHash = await argon2.hash('CustomerPass123!', { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { email: 'admin@shoppilot.local' },
    update: {
      role: Role.ADMIN,
      passwordHash: adminHash,
    },
    create: {
      email: 'admin@shoppilot.local',
      role: Role.ADMIN,
      passwordHash: adminHash,
    },
  });

  await prisma.user.upsert({
    where: { email: 'customer@shoppilot.local' },
    update: {
      role: Role.CUSTOMER,
      passwordHash: customerHash,
    },
    create: {
      email: 'customer@shoppilot.local',
      role: Role.CUSTOMER,
      passwordHash: customerHash,
    },
  });

  await prisma.seedMarker.create({ data: { key: seedKey } });
  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
