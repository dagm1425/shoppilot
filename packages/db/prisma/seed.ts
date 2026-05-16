import argon2 from 'argon2';
import { PrismaClient, ProductCategory, ProductGender, Role } from '@prisma/client';

const prisma = new PrismaClient();

const CATALOG_PRODUCTS = [
  {
    slug: 'arrival-oversized-tank',
    name: 'Arrival Oversized Tank',
    description:
      'Breathable training tank with relaxed drape and lightweight feel for warm gym sessions.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Oversized fit',
    color: 'Force Blue',
    priceCents: 3000,
    currency: 'USD',
    available: true,
    stock: 18,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1583454110551-21f2fa2adfcd?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1574680077505-ff925e7e32ef?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'vital-seamless-legging',
    name: 'Vital Seamless Legging',
    description:
      'High-rise seamless legging designed for squat confidence and all-day comfort.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.WOMEN,
    fit: 'High-rise fit',
    color: 'Night Grey',
    priceCents: 4800,
    currency: 'USD',
    available: true,
    stock: 24,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'essential-cropped-tee',
    name: 'Essential Cropped Tee',
    description:
      'Soft cropped training tee built for mobility drills and light cardio sessions.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Relaxed fit',
    color: 'White',
    priceCents: 2400,
    currency: 'USD',
    available: true,
    stock: 30,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'studio-training-jogger',
    name: 'Studio Training Jogger',
    description:
      'Tapered jogger with stretch waistband and tapered ankle for studio and commute.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.MEN,
    fit: 'Tapered fit',
    color: 'Stone',
    priceCents: 5200,
    currency: 'USD',
    available: true,
    stock: 12,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1503341504253-dff4815485f1?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'power-hoodie',
    name: 'Power Hoodie',
    description:
      'Mid-weight hoodie with brushed interior and minimalist trim for recovery days.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Regular fit',
    color: 'Black',
    priceCents: 6000,
    currency: 'USD',
    available: false,
    stock: 0,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1617137968427-85924c800a22?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'everyday-training-short',
    name: 'Everyday Training Short',
    description:
      'Quick-dry shorts with secure side pocket for short runs and strength days.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.MEN,
    fit: 'Athletic fit',
    color: 'Carbon',
    priceCents: 3400,
    currency: 'USD',
    available: true,
    stock: 20,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1514996937319-344454492b37?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'flow-sports-bra',
    name: 'Flow Sports Bra',
    description:
      'Medium-support sports bra built for interval sessions and day-long comfort.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Supportive fit',
    color: 'Sage',
    priceCents: 3600,
    currency: 'USD',
    available: true,
    stock: 14,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'lift-seamless-tee',
    name: 'Lift Seamless Tee',
    description:
      'Seamless knit tee that wicks sweat and keeps shape through repeated training cycles.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Slim fit',
    color: 'Olive',
    priceCents: 3200,
    currency: 'USD',
    available: true,
    stock: 16,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop',
  },
] as const;

async function seedAuthData() {
  const seedKey = 'phase-0-seed-v1';

  const existing = await prisma.seedMarker.findUnique({
    where: { key: seedKey },
  });

  if (existing) {
    console.log('Auth seed already applied.');
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
      username: 'admin',
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
  console.log('Auth seed completed.');
}

async function seedCatalogData() {
  const seedKey = 'phase-1-catalog-seed-v4';

  const existing = await prisma.seedMarker.findUnique({
    where: { key: seedKey },
  });

  if (existing) {
    console.log('Catalog seed already applied.');
    return;
  }

  for (const product of CATALOG_PRODUCTS) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: { ...product },
      create: { ...product },
    });
  }

  await prisma.seedMarker.create({ data: { key: seedKey } });
  console.log('Catalog seed completed.');
}

async function main() {
  await seedAuthData();
  await seedCatalogData();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
