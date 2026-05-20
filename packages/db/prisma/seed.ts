import argon2 from 'argon2';
import {
  PrismaClient,
  ProductCategory,
  ProductGender,
  ProductThermalProfile,
  Role,
} from '@prisma/client';

const prisma = new PrismaClient();

const CATALOG_PRODUCTS = [
  {
    slug: 'arrival-oversized-tank',
    name: 'Arrival Oversized Tank',
    description:
      'Breathable training tank with relaxed drape and lightweight airflow for hot-weather gym sessions.',
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
      'High-rise seamless legging with compressive support for all-season training comfort.',
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
      'Soft cropped training tee built for mobility drills, light cardio, and breathable warm-weather layering.',
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
      'Tapered jogger with stretch waistband for all-season studio sessions and commute wear.',
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
      'Mid-weight hoodie with brushed interior for warm insulation during cool-weather recovery days.',
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
      'Quick-dry training shorts with breathable liner and secure side pocket for hot-weather runs.',
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
      'Medium-support sports bra with breathable fabric and moisture control for warm gym intervals.',
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
      'Seamless knit tee that wicks sweat and stays breathable through repeated warm-weather training cycles.',
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
  {
    slug: 'thermal-fleece-sweater',
    name: 'Thermal Fleece Sweater',
    description:
      'Soft fleece sweater built for warm insulation during cool-weather commutes and post-workout recovery.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Regular fit',
    color: 'Charcoal',
    priceCents: 6800,
    currency: 'USD',
    available: true,
    stock: 15,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1617137968427-85924c800a22?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'alpine-halfzip-pullover',
    name: 'Alpine Half-Zip Pullover',
    description:
      'Insulated half-zip pullover designed to retain warmth for outdoor cold-weather training blocks.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Athletic fit',
    color: 'Navy',
    priceCents: 7200,
    currency: 'USD',
    available: true,
    stock: 11,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1617137968427-85924c800a22?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'winter-training-crewneck',
    name: 'Winter Training Crewneck',
    description:
      'Brushed crewneck layer that traps heat for winter gym warm-ups and low-temperature sessions.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Relaxed fit',
    color: 'Graphite',
    priceCents: 6400,
    currency: 'USD',
    available: true,
    stock: 13,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1617137968427-85924c800a22?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'airflow-performance-tee-men',
    name: 'Airflow Performance Tee',
    description:
      'Lightweight performance tee with mesh ventilation for breathable hot-weather lifting sessions.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Slim fit',
    color: 'Sky Blue',
    priceCents: 3500,
    currency: 'USD',
    available: true,
    stock: 22,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'summit-merino-baselayer-men',
    name: 'Summit Merino Baselayer',
    description:
      'Merino baselayer top that regulates heat and stays warm for cold-weather endurance training.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Compression fit',
    color: 'Forest',
    priceCents: 7600,
    currency: 'USD',
    available: true,
    stock: 10,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'chill-shield-anorak-men',
    name: 'Chill Shield Anorak',
    description:
      'Wind-blocking anorak with thermal lining for insulated warmth in chilly outdoor workouts.',
    category: ProductCategory.TOPS,
    gender: ProductGender.MEN,
    fit: 'Regular fit',
    color: 'Onyx',
    priceCents: 8200,
    currency: 'USD',
    available: true,
    stock: 9,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1617137968427-85924c800a22?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'thermal-fleece-sweatpant-men',
    name: 'Thermal Fleece Sweatpant',
    description:
      'Fleece sweatpants with brushed interior for warm insulation on winter training and recovery days.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.MEN,
    fit: 'Tapered fit',
    color: 'Black',
    priceCents: 6200,
    currency: 'USD',
    available: true,
    stock: 14,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1503341504253-dff4815485f1?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'coldguard-track-pant-men',
    name: 'ColdGuard Track Pant',
    description:
      'Insulated track pants with weather-resistant shell for cold-weather runs and warm leg coverage.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.MEN,
    fit: 'Athletic fit',
    color: 'Slate',
    priceCents: 6600,
    currency: 'USD',
    available: true,
    stock: 12,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1503341504253-dff4815485f1?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'ultralight-run-short-men',
    name: 'Ultralight Run Short',
    description:
      'Ultralight running shorts with vented panels for breathable comfort in hot-weather training.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.MEN,
    fit: 'Athletic fit',
    color: 'Cobalt',
    priceCents: 3300,
    currency: 'USD',
    available: true,
    stock: 25,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1514996937319-344454492b37?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'vent-mesh-training-short-men',
    name: 'Vent Mesh Training Short',
    description:
      'Breathable mesh-lined training shorts built for airflow during high-heat gym intervals.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.MEN,
    fit: 'Regular fit',
    color: 'Graphite',
    priceCents: 3100,
    currency: 'USD',
    available: true,
    stock: 21,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1514996937319-344454492b37?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1491553895911-0055eca6402d?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'allseason-stretch-jogger-men',
    name: 'All-Season Stretch Jogger',
    description:
      'Stretch jogger with medium-weight fabric tuned for all-season workouts and daily wear.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.MEN,
    fit: 'Tapered fit',
    color: 'Olive',
    priceCents: 5400,
    currency: 'USD',
    available: true,
    stock: 17,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1503341504253-dff4815485f1?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'cozy-knit-sweater-women',
    name: 'Cozy Knit Sweater',
    description:
      'Soft knit sweater that provides warm insulation for cool-weather studio commutes.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Relaxed fit',
    color: 'Cream',
    priceCents: 6100,
    currency: 'USD',
    available: true,
    stock: 16,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'thermal-zip-fleece-women',
    name: 'Thermal Zip Fleece',
    description:
      'Thermal fleece zip layer built to trap warmth during cold-weather morning training.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Regular fit',
    color: 'Plum',
    priceCents: 6900,
    currency: 'USD',
    available: true,
    stock: 12,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'breeze-mesh-tee-women',
    name: 'Breeze Mesh Tee',
    description:
      'Breathable mesh tee with lightweight stretch for warm-weather cardio and strength sessions.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Slim fit',
    color: 'Coral',
    priceCents: 3400,
    currency: 'USD',
    available: true,
    stock: 23,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'airflow-racerback-tank-women',
    name: 'Airflow Racerback Tank',
    description:
      'Lightweight racerback tank with cooling airflow channels for hot-weather studio classes.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Athletic fit',
    color: 'Mint',
    priceCents: 2900,
    currency: 'USD',
    available: true,
    stock: 26,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'sculpt-support-bra-women',
    name: 'Sculpt Support Bra',
    description:
      'Supportive sports bra with breathable knit and moisture control for hot-weather workout sessions.',
    category: ProductCategory.TOPS,
    gender: ProductGender.WOMEN,
    fit: 'Supportive fit',
    color: 'Rose',
    priceCents: 3900,
    currency: 'USD',
    available: true,
    stock: 19,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'fleece-lounge-sweatpant-women',
    name: 'Fleece Lounge Sweatpant',
    description:
      'Cozy fleece sweatpants designed for warm coverage on cold-weather recovery days.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.WOMEN,
    fit: 'Relaxed fit',
    color: 'Heather Grey',
    priceCents: 5900,
    currency: 'USD',
    available: true,
    stock: 14,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'cold-weather-legging-women',
    name: 'Cold Weather Legging',
    description:
      'Thermal brushed leggings that keep legs warm during cold-weather runs and outdoor drills.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.WOMEN,
    fit: 'High-rise fit',
    color: 'Midnight',
    priceCents: 6300,
    currency: 'USD',
    available: true,
    stock: 13,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'quickdry-run-short-women',
    name: 'QuickDry Run Short',
    description:
      'Quick-dry running shorts with breathable liner for lightweight hot-weather mileage.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.WOMEN,
    fit: 'Athletic fit',
    color: 'Lavender',
    priceCents: 3200,
    currency: 'USD',
    available: true,
    stock: 24,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'breathable-bike-short-women',
    name: 'Breathable Bike Short',
    description:
      'Lightweight bike shorts with cooling compression for warm-weather cardio training.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.WOMEN,
    fit: 'Compression fit',
    color: 'Sage',
    priceCents: 3500,
    currency: 'USD',
    available: true,
    stock: 20,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
  },
  {
    slug: 'allseason-studio-jogger-women',
    name: 'All-Season Studio Jogger',
    description:
      'Medium-weight jogger tuned for all-season studio sessions with balanced warmth and breathability.',
    category: ProductCategory.BOTTOMS,
    gender: ProductGender.WOMEN,
    fit: 'Tapered fit',
    color: 'Taupe',
    priceCents: 5300,
    currency: 'USD',
    available: true,
    stock: 18,
    primaryImageUrl:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800&auto=format&fit=crop',
    secondaryImageUrl:
      'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?q=80&w=800&auto=format&fit=crop',
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
  const seedKey = 'phase-1-catalog-seed-v6';

  const existing = await prisma.seedMarker.findUnique({
    where: { key: seedKey },
  });

  if (existing) {
    console.log('Catalog seed already applied.');
    return;
  }

  for (const product of CATALOG_PRODUCTS) {
    const thermalProfile = deriveThermalProfile(product.description);
    const productData = { ...product, thermalProfile };
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: productData,
      create: productData,
    });
  }

  await prisma.seedMarker.create({ data: { key: seedKey } });
  console.log('Catalog seed completed.');
}

function deriveThermalProfile(description: string): ProductThermalProfile {
  const lowered = description.toLowerCase();

  if (/\ball-season\b|\ball season\b/.test(lowered)) {
    return ProductThermalProfile.ALL_SEASON;
  }

  if (
    /\bhot-weather\b|\bhot weather\b|\bwarm-weather\b|\bwarm weather\b|\bsummer\b|\bbreathable\b|\blightweight\b|\bcooling\b|\bairflow\b|\bventilated\b/.test(
      lowered,
    )
  ) {
    return ProductThermalProfile.HOT_WEATHER;
  }

  if (
    /\bcold-weather\b|\bcold weather\b|\bwinter\b|\binsulated\b|\bthermal\b|\bfleece\b|\bmerino\b|\bchilly\b|\bwarm\b/.test(
      lowered,
    )
  ) {
    return ProductThermalProfile.COLD_WEATHER;
  }

  return ProductThermalProfile.ALL_SEASON;
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
