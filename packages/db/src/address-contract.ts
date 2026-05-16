export type AddressRecord = {
  addressId: string;
  recipientName: string;
  country: string;
  city: string;
  postalCode: string;
  line1: string;
  line2?: string | null;
  phone?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AddressListResponse = {
  items: AddressRecord[];
};

export type CreateAddressInput = {
  recipientName: string;
  country: string;
  city: string;
  postalCode: string;
  line1: string;
  line2?: string | null;
  phone?: string | null;
  isDefault?: boolean;
};

export type UpdateAddressInput = Partial<CreateAddressInput>;

export type DeleteAddressResponse = {
  deletedAddressId: string;
  defaultAddressId?: string;
};
