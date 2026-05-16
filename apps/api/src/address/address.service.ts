import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AddressRecord,
  AddressListResponse,
  CreateAddressInput,
  DeleteAddressResponse,
  UpdateAddressInput,
} from '@shoppilot/db/address-contract';
import type { Address, Prisma } from '@prisma/client';
import type { AuthenticatedRequestUser } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAddresses(
    user: AuthenticatedRequestUser,
    requestId?: string,
  ): Promise<AddressListResponse> {
    const addresses = await this.prisma.address.findMany({
      where: {
        userId: user.id,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    this.logger.log({
      event: 'address.list',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      count: addresses.length,
    });

    return {
      items: addresses.map((address) => this.mapAddress(address)),
    };
  }

  async createAddress(
    user: AuthenticatedRequestUser,
    input: CreateAddressInput,
    requestId?: string,
  ): Promise<AddressRecord> {
    const created = await this.prisma.$transaction(async (transaction) => {
      const existingCount = await transaction.address.count({
        where: {
          userId: user.id,
        },
      });

      const shouldBeDefault = input.isDefault === true || existingCount === 0;

      if (shouldBeDefault) {
        await transaction.address.updateMany({
          where: {
            userId: user.id,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return transaction.address.create({
        data: {
          userId: user.id,
          recipientName: input.recipientName,
          country: input.country,
          city: input.city,
          postalCode: input.postalCode,
          line1: input.line1,
          line2: input.line2,
          phone: input.phone,
          isDefault: shouldBeDefault,
        },
      });
    });

    this.logger.log({
      event: 'address.create',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      addressId: created.id,
      isDefault: created.isDefault,
    });

    return this.mapAddress(created);
  }

  async updateAddress(
    user: AuthenticatedRequestUser,
    addressId: string,
    input: UpdateAddressInput,
    requestId?: string,
  ): Promise<AddressRecord> {
    const updatedAddress = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.address.findFirst({
        where: {
          id: addressId,
          userId: user.id,
        },
      });

      if (!existing) {
        throw new HttpException(
          {
            code: 'ADDRESS_NOT_FOUND',
            message: 'Address not found.',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const updateData: Prisma.AddressUpdateInput = {
        ...(input.recipientName !== undefined ? { recipientName: input.recipientName } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
        ...(input.line1 !== undefined ? { line1: input.line1 } : {}),
        ...(input.line2 !== undefined ? { line2: input.line2 } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      };

      if (input.isDefault === true) {
        await transaction.address.updateMany({
          where: {
            userId: user.id,
          },
          data: {
            isDefault: false,
          },
        });

        return transaction.address.update({
          where: {
            id: addressId,
          },
          data: {
            ...updateData,
            isDefault: true,
          },
        });
      }

      if (input.isDefault === false && existing.isDefault) {
        const replacementDefault = await transaction.address.findFirst({
          where: {
            userId: user.id,
            id: {
              not: addressId,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        if (!replacementDefault) {
          throw new HttpException(
            {
              code: 'ADDRESS_DEFAULT_REQUIRED',
              message: 'At least one default address is required.',
            },
            HttpStatus.CONFLICT,
          );
        }

        await transaction.address.update({
          where: {
            id: replacementDefault.id,
          },
          data: {
            isDefault: true,
          },
        });

        return transaction.address.update({
          where: {
            id: addressId,
          },
          data: {
            ...updateData,
            isDefault: false,
          },
        });
      }

      return transaction.address.update({
        where: {
          id: addressId,
        },
        data: updateData,
      });
    });

    this.logger.log({
      event: 'address.update',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      addressId: updatedAddress.id,
      isDefault: updatedAddress.isDefault,
    });

    return this.mapAddress(updatedAddress);
  }

  async deleteAddress(
    user: AuthenticatedRequestUser,
    addressId: string,
    requestId?: string,
  ): Promise<DeleteAddressResponse> {
    const payload = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.address.findFirst({
        where: {
          id: addressId,
          userId: user.id,
        },
      });

      if (!existing) {
        throw new HttpException(
          {
            code: 'ADDRESS_NOT_FOUND',
            message: 'Address not found.',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      await transaction.address.delete({
        where: {
          id: addressId,
        },
      });

      let defaultAddressId: string | undefined;

      if (existing.isDefault) {
        const nextDefault = await transaction.address.findFirst({
          where: {
            userId: user.id,
          },
          orderBy: {
            createdAt: 'asc',
          },
        });

        if (nextDefault) {
          await transaction.address.update({
            where: {
              id: nextDefault.id,
            },
            data: {
              isDefault: true,
            },
          });

          defaultAddressId = nextDefault.id;
        }
      }

      return {
        deletedAddressId: existing.id,
        defaultAddressId,
      };
    });

    this.logger.log({
      event: 'address.delete',
      requestId: requestId ?? 'unknown-request-id',
      userId: user.id,
      outcome: 'success',
      addressId,
      defaultAddressId: payload.defaultAddressId,
    });

    return payload;
  }

  private mapAddress(address: Address): AddressRecord {
    return {
      addressId: address.id,
      recipientName: address.recipientName,
      country: address.country,
      city: address.city,
      postalCode: address.postalCode,
      line1: address.line1,
      line2: address.line2,
      phone: address.phone,
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    };
  }
}
