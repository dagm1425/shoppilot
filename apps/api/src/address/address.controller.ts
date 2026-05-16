import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import type { RequestWithContext } from '../common/request-context.js';
import {
  parseAddressIdOrThrow,
  parseCreateAddressInputOrThrow,
  parseUpdateAddressInputOrThrow,
} from './address.schemas.js';
import { AddressService } from './address.service.js';

@Controller('me/addresses')
@UseGuards(JwtAuthGuard)
export class AddressController {
  constructor(@Inject(AddressService) private readonly addressService: AddressService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() request: RequestWithContext,
  ) {
    Sentry.setTag('address.operation', 'list');

    return Sentry.startSpan(
      {
        name: 'address.list',
        op: 'http.server',
      },
      async () => this.addressService.listAddresses(user, request.requestId),
    );
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const input = parseCreateAddressInputOrThrow(body);
    Sentry.setTag('address.operation', 'create');

    return Sentry.startSpan(
      {
        name: 'address.create',
        op: 'http.server',
      },
      async () => this.addressService.createAddress(user, input, request.requestId),
    );
  }

  @Patch(':addressId')
  async update(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('addressId') addressId: string,
    @Body() body: unknown,
    @Req() request: RequestWithContext,
  ) {
    const parsedAddressId = parseAddressIdOrThrow(addressId);
    const input = parseUpdateAddressInputOrThrow(body);
    Sentry.setTag('address.operation', 'update');

    return Sentry.startSpan(
      {
        name: 'address.update',
        op: 'http.server',
      },
      async () => this.addressService.updateAddress(user, parsedAddressId, input, request.requestId),
    );
  }

  @Delete(':addressId')
  async remove(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('addressId') addressId: string,
    @Req() request: RequestWithContext,
  ) {
    const parsedAddressId = parseAddressIdOrThrow(addressId);
    Sentry.setTag('address.operation', 'delete');

    return Sentry.startSpan(
      {
        name: 'address.delete',
        op: 'http.server',
      },
      async () => this.addressService.deleteAddress(user, parsedAddressId, request.requestId),
    );
  }
}
