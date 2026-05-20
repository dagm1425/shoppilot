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
      'https://m.media-amazon.com/images/I/81O-J3L8klL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71gN2oVaD6L._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/51AruKfAdQL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/51-o2V4r6YL._AC_SL1337_.jpg',
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
      'https://m.media-amazon.com/images/I/81YUBG3eciL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71SR6dIgqBL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71kD4Pe411L.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71rbqp7SGkL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/6129DggIXvL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71pq3EXek2L._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/61O7+kYBMcL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/61x7fNAgA1L._AC_SL1001_.jpg',
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
      'https://m.media-amazon.com/images/I/81VfUvVFNgL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71lAWy+4b0L._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71CCtVB9xmL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/81r563-PiRL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/91q3miqFidL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/91QzH7ij7uL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71FYf8UnelL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/81m98VlUFBL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71jX14il7fL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71Pxu9TTyxL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/61BuKm2+WPL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/618CN4He4GL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/81L7S4-XWYL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71crLuqUpHL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71SIEJr4blL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/61gGMjyhCPL._AC_SL1024_.jpg',
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
      'https://m.media-amazon.com/images/I/71rdzL0Le4L.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71F2g4zXvML._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71vmjNFoJGL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/61mhuvfSxbL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/61gtyu9hsLL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71RBTOedZQL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/617ATXVhyjL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71GoPfWgx-L._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/61Kwr87jA9L.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/61TYLX2UwdL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/717EPQByVML.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71-Y1kW9kDL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/61N1ggxzmRL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71hVS7hhhOL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71H7iRI+pTL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/61dvXlsnS3L._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71-T2LHikYL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71arQUkQ95L._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/61GgeC8fJzL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71tkZzf2CwL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/618F0p3srbL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71iiUAeHK0L._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71FhHYrvVVL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71Fhkml7seL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71sQ8Z6ipLL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/71PGlXvO0eL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/71dIYgaX09L.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/619wVWhmeoL._AC_SL1500_.jpg',
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
      'https://m.media-amazon.com/images/I/61WNIrguNBL.jpg',
    secondaryImageUrl:
      'https://m.media-amazon.com/images/I/61+yVPaIeCL._AC_SL1500_.jpg',
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
  const seedKey = 'phase-1-catalog-seed-v7';

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
