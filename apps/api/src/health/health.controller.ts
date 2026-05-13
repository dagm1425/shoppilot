import { Controller, Get, Inject, Query } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  async health(@Query('checkDb') checkDb?: string) {
    return this.healthService.getHealth(checkDb === '1');
  }
}
