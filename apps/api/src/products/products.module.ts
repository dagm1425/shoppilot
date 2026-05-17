import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductMediaStorageService } from './product-media-storage.service.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductMediaStorageService],
})
export class ProductsModule {}
