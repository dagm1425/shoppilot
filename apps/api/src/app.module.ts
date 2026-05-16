import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProductsModule } from './products/products.module.js';
import { CartModule } from './cart/cart.module.js';
import { WishlistModule } from './wishlist/wishlist.module.js';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, ProductsModule, CartModule, WishlistModule],
})
export class AppModule {}
