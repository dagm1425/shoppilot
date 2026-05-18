'use client';

import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  createAdminProduct,
  getAdminProductsErrorMessage,
  presignAdminProductMedia,
  updateAdminProduct,
  uploadAdminProductMediaFile,
  type AdminProductMutationResponse,
} from '../lib/admin-api';
import {
  adminCreateProductSchema,
  adminMediaPresignRequestSchema,
  adminProductIdLookupSchema,
  adminUpdateProductSchema,
  type AdminProductMediaMetadata,
  type AdminProductMediaRole,
  type AdminUpdateProductInput,
} from '../lib/admin-product-form-schemas';
import { fetchCatalogProductDetails, fetchCatalogProducts } from '../lib/catalog-api';
import { reportClientError } from '../lib/client-error';
import { showToast } from '../lib/toast-store';
import { StatePanel } from './state-panel';

type ProductFormState = {
  slug: string;
  name: string;
  description: string;
  category: 'bottoms' | 'tops';
  gender: 'men' | 'women';
  fit: string;
  color: string;
  priceCents: string;
  stock: string;
  available: boolean;
};

type ProductEditFormState = {
  name: string;
  description: string;
  category: 'bottoms' | 'tops';
  gender: 'men' | 'women';
  fit: string;
  color: string;
  priceCents: string;
  stock: string;
  available: boolean;
};

type UploadState = {
  uploading: boolean;
  error: string | null;
  metadata: AdminProductMediaMetadata | null;
  previewUrl: string | null;
  altText: string;
};

type OperationState = {
  status: 'idle' | 'loading' | 'error' | 'success' | 'disabled';
  message: string;
};

type ProductLookupOption = {
  slug: string;
};

const MAX_UPLOAD_BYTES = 5_242_880;
const ACCEPTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function createInitialUploadState(): UploadState {
  return {
    uploading: false,
    error: null,
    metadata: null,
    previewUrl: null,
    altText: '',
  };
}

const defaultCreateForm: ProductFormState = {
  slug: '',
  name: '',
  description: '',
  category: 'tops',
  gender: 'men',
  fit: '',
  color: '',
  priceCents: '',
  stock: '',
  available: true,
};

const defaultUpdateForm: ProductEditFormState = {
  name: '',
  description: '',
  category: 'tops',
  gender: 'men',
  fit: '',
  color: '',
  priceCents: '',
  stock: '',
  available: true,
};

function coerceMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function withAltText(metadata: AdminProductMediaMetadata, altText: string): AdminProductMediaMetadata {
  const trimmed = altText.trim();
  if (trimmed.length === 0) {
    const withoutAltText = { ...metadata };
    delete withoutAltText.altText;
    return withoutAltText;
  }

  return {
    ...metadata,
    altText: trimmed,
  };
}

function applyAltTextToMetadata(
  metadata: AdminProductMediaMetadata | null,
  altText: string,
): AdminProductMediaMetadata | null {
  if (!metadata) {
    return null;
  }

  const trimmed = altText.trim();
  if (trimmed.length === 0) {
    const withoutAltText = { ...metadata };
    delete withoutAltText.altText;
    return withoutAltText;
  }

  return {
    ...metadata,
    altText: trimmed,
  };
}

function FormField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="space-y-1">
      <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  disabled,
  onChange,
  type = 'text',
  placeholder,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
    />
  );
}

function TextArea({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      rows={4}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
    />
  );
}

function MediaUploadField({
  id,
  title,
  role,
  required,
  disabled,
  state,
  onUpload,
  onAltTextChange,
  onClear,
}: {
  id: string;
  title: string;
  role: AdminProductMediaRole;
  required: boolean;
  disabled: boolean;
  state: UploadState;
  onUpload: (role: AdminProductMediaRole, file: File) => Promise<void>;
  onAltTextChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">
            {required ? 'Required image' : 'Optional image'} ({ACCEPTED_CONTENT_TYPES.join(', ')})
          </p>
        </div>
        {state.metadata ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || state.uploading}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
          >
            Clear
          </button>
        ) : null}
      </div>

      <input
        id={id}
        type="file"
        accept={ACCEPTED_CONTENT_TYPES.join(',')}
        disabled={disabled || state.uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = '';
          if (!file) {
            return;
          }

          void onUpload(role, file);
        }}
        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
      />

      {state.uploading ? <p className="text-xs text-muted-foreground">Uploading image...</p> : null}
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}

      {state.metadata ? (
        <div className="space-y-2">
          <p className="text-xs text-success">Upload complete.</p>
          {state.previewUrl ? (
            <img
              src={state.previewUrl}
              alt={`${title} preview`}
              className="h-24 w-24 rounded-md border border-border object-cover"
            />
          ) : null}
          <label htmlFor={`${id}-alt`} className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Alt text</span>
            <input
              id={`${id}-alt`}
              type="text"
              value={state.altText}
              onChange={(event) => onAltTextChange(event.target.value)}
              disabled={disabled || state.uploading}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
              placeholder="Describe the image"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function AdminProductsPanel() {
  const [createForm, setCreateForm] = useState<ProductFormState>(defaultCreateForm);
  const [createPrimaryUpload, setCreatePrimaryUpload] = useState<UploadState>(createInitialUploadState());
  const [createSecondaryUpload, setCreateSecondaryUpload] = useState<UploadState>(createInitialUploadState());
  const [createOperation, setCreateOperation] = useState<OperationState>({
    status: 'idle',
    message: 'Fill out the form and upload at least one primary image.',
  });
  const [latestCreatedProduct, setLatestCreatedProduct] = useState<AdminProductMutationResponse['product'] | null>(
    null,
  );

  const [lookupProductId, setLookupProductId] = useState('');
  const [lookupSearch, setLookupSearch] = useState('');
  const [lookupOptions, setLookupOptions] = useState<ProductLookupOption[]>([]);
  const [lookupOptionsState, setLookupOptionsState] = useState<OperationState>({
    status: 'loading',
    message: 'Loading product slugs...',
  });
  const [lookupState, setLookupState] = useState<OperationState>({
    status: 'idle',
    message: 'Select an existing product slug to load update fields.',
  });
  const [loadedProductId, setLoadedProductId] = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState<ProductEditFormState>(defaultUpdateForm);
  const [updatePrimaryUpload, setUpdatePrimaryUpload] = useState<UploadState>(createInitialUploadState());
  const [updateSecondaryUpload, setUpdateSecondaryUpload] = useState<UploadState>(createInitialUploadState());
  const [updateOperation, setUpdateOperation] = useState<OperationState>({
    status: 'idle',
    message: 'Load a product, then apply updates.',
  });

  const createBusy =
    createOperation.status === 'loading' || createPrimaryUpload.uploading || createSecondaryUpload.uploading;
  const updateBusy =
    updateOperation.status === 'loading' || updatePrimaryUpload.uploading || updateSecondaryUpload.uploading;

  const firstLookupSearchMatch = useMemo(() => {
    const normalized = lookupSearch.trim().toLowerCase();
    if (normalized.length === 0) {
      return null;
    }

    return lookupOptions.find((option) => option.slug.toLowerCase().includes(normalized)) ?? null;
  }, [lookupOptions, lookupSearch]);

  useEffect(() => {
    if (!firstLookupSearchMatch) {
      return;
    }

    setLookupProductId((previous) => {
      if (previous === firstLookupSearchMatch.slug) {
        return previous;
      }

      return firstLookupSearchMatch.slug;
    });
  }, [firstLookupSearchMatch]);

  const canSubmitCreate = Boolean(createPrimaryUpload.metadata) && !createBusy;

  const createStateVariant = useMemo(() => {
    switch (createOperation.status) {
      case 'loading':
        return 'loading' as const;
      case 'error':
        return 'error' as const;
      case 'success':
        return 'success' as const;
      case 'disabled':
        return 'disabled' as const;
      default:
        return 'empty' as const;
    }
  }, [createOperation.status]);

  const updateStateVariant = useMemo(() => {
    switch (updateOperation.status) {
      case 'loading':
        return 'loading' as const;
      case 'error':
        return 'error' as const;
      case 'success':
        return 'success' as const;
      case 'disabled':
        return 'disabled' as const;
      default:
        return 'empty' as const;
    }
  }, [updateOperation.status]);

  async function loadLookupOptions() {
    setLookupOptionsState({
      status: 'loading',
      message: 'Loading product slugs...',
    });

    try {
      const collected = new Map<string, ProductLookupOption>();
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && page <= 20) {
        const response = await fetchCatalogProducts({
          page,
          pageSize,
          sort: 'newest',
        });

        if (!response.ok) {
          setLookupOptionsState({
            status: 'error',
            message: response.message,
          });
          return;
        }

        for (const item of response.data.items) {
          collected.set(item.productId, {
            slug: item.productId,
          });
        }

        totalPages = response.data.pagination.totalPages;
        page += 1;
      }

      const options = [...collected.values()].sort((left, right) => left.slug.localeCompare(right.slug));
      setLookupOptions(options);
      setLookupProductId((previous) => {
        if (previous.trim().length > 0) {
          return previous;
        }

        return options[0]?.slug ?? '';
      });
      setLookupOptionsState({
        status: 'success',
        message: `Loaded ${options.length} product slugs.`,
      });
    } catch (error) {
      reportClientError({ error, context: 'admin-products:lookup-options' });
      setLookupOptionsState({
        status: 'error',
        message: 'Could not load product slugs right now.',
      });
    }
  }

  useEffect(() => {
    void loadLookupOptions();
  }, []);

  async function uploadMedia(
    role: AdminProductMediaRole,
    file: File,
    setState: Dispatch<SetStateAction<UploadState>>,
  ) {
    if (!ACCEPTED_CONTENT_TYPES.includes(file.type as (typeof ACCEPTED_CONTENT_TYPES)[number])) {
      setState((previous) => ({
        ...previous,
        error: 'Unsupported file type. Use JPEG, PNG, or WebP.',
      }));
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setState((previous) => ({
        ...previous,
        error: `File is too large. Maximum size is ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`,
      }));
      return;
    }

    setState((previous) => ({
      ...previous,
      uploading: true,
      error: null,
    }));

    try {
      const presignInputParse = adminMediaPresignRequestSchema.safeParse({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        role,
      });

      if (!presignInputParse.success) {
        throw new Error(presignInputParse.error.issues[0]?.message ?? 'Media payload is invalid.');
      }

      const presignResponse = await presignAdminProductMedia(presignInputParse.data);
      if (!presignResponse.ok) {
        setState((previous) => ({
          ...previous,
          uploading: false,
          error: getAdminProductsErrorMessage(presignResponse.message, presignResponse.code),
        }));
        return;
      }

      const uploadSuccess = await uploadAdminProductMediaFile({
        uploadUrl: presignResponse.data.uploadUrl,
        contentType: file.type,
        file,
      });

      if (!uploadSuccess) {
        setState((previous) => ({
          ...previous,
          uploading: false,
          error: 'Upload failed before product save. Please retry.',
        }));
        return;
      }

      setState((previous) => ({
        ...previous,
        uploading: false,
        error: null,
        previewUrl: URL.createObjectURL(file),
        metadata: {
          objectKey: presignResponse.data.objectKey,
          url: presignResponse.data.publicUrl,
          contentType: presignInputParse.data.contentType,
          sizeBytes: presignInputParse.data.sizeBytes,
          ...(previous.altText.trim().length > 0 ? { altText: previous.altText.trim() } : {}),
        },
      }));
    } catch (error) {
      reportClientError({ error, context: `admin-products:upload:${role}` });
      setState((previous) => ({
        ...previous,
        uploading: false,
        error: 'Upload could not be completed. Please try again.',
      }));
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!createPrimaryUpload.metadata) {
      setCreateOperation({
        status: 'disabled',
        message: 'Primary image is required before creating a product.',
      });
      return;
    }

    const parsedPrice = coerceMoneyInput(createForm.priceCents);
    const parsedStock = coerceMoneyInput(createForm.stock);

    if (parsedPrice === null || parsedStock === null) {
      setCreateOperation({
        status: 'error',
        message: 'Price and stock must be valid whole numbers.',
      });
      return;
    }

    const payload = {
      ...(createForm.slug.trim().length > 0 ? { slug: createForm.slug.trim() } : {}),
      name: createForm.name,
      description: createForm.description,
      category: createForm.category,
      gender: createForm.gender,
      fit: createForm.fit,
      color: createForm.color,
      priceCents: parsedPrice,
      stock: parsedStock,
      available: createForm.available,
      media: {
        primary: withAltText(createPrimaryUpload.metadata, createPrimaryUpload.altText),
        ...(createSecondaryUpload.metadata
          ? {
              secondary: withAltText(createSecondaryUpload.metadata, createSecondaryUpload.altText),
            }
          : {}),
      },
    };

    const parsedPayload = adminCreateProductSchema.safeParse(payload);
    if (!parsedPayload.success) {
      setCreateOperation({
        status: 'error',
        message: parsedPayload.error.issues[0]?.message ?? 'Product input is invalid.',
      });
      return;
    }

    setCreateOperation({
      status: 'loading',
      message: 'Creating product record...',
    });

    try {
      const response = await createAdminProduct(parsedPayload.data);
      if (!response.ok) {
        setCreateOperation({
          status: 'error',
          message: getAdminProductsErrorMessage(response.message, response.code),
        });
        return;
      }

      setLatestCreatedProduct(response.data.product);
      setCreateOperation({
        status: 'success',
        message: `Created ${response.data.product.name} (${response.data.product.productId}).`,
      });
      setCreateForm(defaultCreateForm);
      setCreatePrimaryUpload(createInitialUploadState());
      setCreateSecondaryUpload(createInitialUploadState());
    } catch (error) {
      reportClientError({ error, context: 'admin-products:create' });
      setCreateOperation({
        status: 'error',
        message: 'Product creation failed unexpectedly.',
      });
    }
  }

  async function handleLookupProduct() {
    const parsedLookup = adminProductIdLookupSchema.safeParse(lookupProductId);
    if (!parsedLookup.success) {
      setLookupState({
        status: 'error',
        message: parsedLookup.error.issues[0]?.message ?? 'Product slug is invalid.',
      });
      return;
    }

    setLookupState({
      status: 'loading',
      message: 'Loading product details...',
    });

    try {
      const response = await fetchCatalogProductDetails(parsedLookup.data);
      if (!response.ok) {
        setLookupState({
          status: 'error',
          message: getAdminProductsErrorMessage(response.message, response.code),
        });
        setLoadedProductId(null);
        return;
      }

      const product = response.data.product;
      setLoadedProductId(product.productId);
      setUpdateForm({
        name: product.name,
        description: product.description,
        category: product.category,
        gender: product.gender,
        fit: product.fit,
        color: product.color,
        priceCents: String(product.priceCents),
        stock: String(product.stock),
        available: product.available,
      });
      setUpdatePrimaryUpload(createInitialUploadState());
      setUpdateSecondaryUpload(createInitialUploadState());
      setLookupState({
        status: 'success',
        message: `Loaded ${product.name}. You can apply updates now.`,
      });
      setUpdateOperation({
        status: 'idle',
        message: 'Edit fields and submit update when ready.',
      });
    } catch (error) {
      reportClientError({ error, context: 'admin-products:lookup' });
      setLookupState({
        status: 'error',
        message: 'Could not load this product right now.',
      });
      setLoadedProductId(null);
    }
  }

  async function handleUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!loadedProductId) {
      setUpdateOperation({
        status: 'disabled',
        message: 'Load a product before submitting updates.',
      });
      return;
    }

    const parsedPrice = coerceMoneyInput(updateForm.priceCents);
    const parsedStock = coerceMoneyInput(updateForm.stock);

    if (parsedPrice === null || parsedStock === null) {
      setUpdateOperation({
        status: 'error',
        message: 'Price and stock must be valid whole numbers.',
      });
      return;
    }

    const payload: AdminUpdateProductInput = {
      name: updateForm.name,
      description: updateForm.description,
      category: updateForm.category,
      gender: updateForm.gender,
      fit: updateForm.fit,
      color: updateForm.color,
      priceCents: parsedPrice,
      stock: parsedStock,
      available: updateForm.available,
      ...(updatePrimaryUpload.metadata || updateSecondaryUpload.metadata
        ? {
            media: {
              ...(updatePrimaryUpload.metadata
                ? {
                    primary: withAltText(updatePrimaryUpload.metadata, updatePrimaryUpload.altText),
                  }
                : {}),
              ...(updateSecondaryUpload.metadata
                ? {
                    secondary: withAltText(updateSecondaryUpload.metadata, updateSecondaryUpload.altText),
                  }
                : {}),
            },
          }
        : {}),
    };

    const parsedPayload = adminUpdateProductSchema.safeParse(payload);
    if (!parsedPayload.success) {
      setUpdateOperation({
        status: 'error',
        message: parsedPayload.error.issues[0]?.message ?? 'Update payload is invalid.',
      });
      return;
    }

    setUpdateOperation({
      status: 'loading',
      message: 'Applying product updates...',
    });

    try {
      const response = await updateAdminProduct(loadedProductId, parsedPayload.data);
      if (!response.ok) {
        setUpdateOperation({
          status: 'error',
          message: getAdminProductsErrorMessage(response.message, response.code),
        });
        return;
      }

      setUpdateOperation({
        status: 'success',
        message: `Updated ${response.data.product.name} (${response.data.product.productId}).`,
      });
      setUpdatePrimaryUpload(createInitialUploadState());
      setUpdateSecondaryUpload(createInitialUploadState());
      showToast({
        variant: 'success',
        message: 'Product updates saved successfully.',
      });
    } catch (error) {
      reportClientError({ error, context: 'admin-products:update' });
      setUpdateOperation({
        status: 'error',
        message: 'Update could not be completed right now.',
      });
    }
  }

  return (
    <section className="space-y-4">
      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Admin products</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Create and update catalog products</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload primary/secondary images, capture media metadata, and persist admin product changes.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={handleCreateSubmit} className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">OPS-004</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Create product</h3>
            </div>
            <button
              type="submit"
              disabled={!canSubmitCreate}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createOperation.status === 'loading' ? 'Creating...' : 'Create product'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="create-slug" label="Slug (optional)">
              <TextInput
                id="create-slug"
                value={createForm.slug}
                disabled={createBusy}
                onChange={(value) => setCreateForm((previous) => ({ ...previous, slug: value }))}
                placeholder="auto-generated-from-name"
              />
            </FormField>
            <FormField id="create-name" label="Name">
              <TextInput
                id="create-name"
                value={createForm.name}
                disabled={createBusy}
                onChange={(value) => setCreateForm((previous) => ({ ...previous, name: value }))}
              />
            </FormField>
            <FormField id="create-category" label="Category">
              <select
                id="create-category"
                value={createForm.category}
                disabled={createBusy}
                onChange={(event) =>
                  setCreateForm((previous) => ({
                    ...previous,
                    category: event.target.value as ProductFormState['category'],
                  }))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="tops">Tops</option>
                <option value="bottoms">Bottoms</option>
              </select>
            </FormField>
            <FormField id="create-gender" label="Gender">
              <select
                id="create-gender"
                value={createForm.gender}
                disabled={createBusy}
                onChange={(event) =>
                  setCreateForm((previous) => ({
                    ...previous,
                    gender: event.target.value as ProductFormState['gender'],
                  }))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="men">Men</option>
                <option value="women">Women</option>
              </select>
            </FormField>
            <FormField id="create-fit" label="Fit">
              <TextInput
                id="create-fit"
                value={createForm.fit}
                disabled={createBusy}
                onChange={(value) => setCreateForm((previous) => ({ ...previous, fit: value }))}
              />
            </FormField>
            <FormField id="create-color" label="Color">
              <TextInput
                id="create-color"
                value={createForm.color}
                disabled={createBusy}
                onChange={(value) => setCreateForm((previous) => ({ ...previous, color: value }))}
              />
            </FormField>
            <FormField id="create-price" label="Price (cents)">
              <TextInput
                id="create-price"
                type="number"
                value={createForm.priceCents}
                disabled={createBusy}
                onChange={(value) => setCreateForm((previous) => ({ ...previous, priceCents: value }))}
              />
            </FormField>
            <FormField id="create-stock" label="Stock">
              <TextInput
                id="create-stock"
                type="number"
                value={createForm.stock}
                disabled={createBusy}
                onChange={(value) => setCreateForm((previous) => ({ ...previous, stock: value }))}
              />
            </FormField>
            <FormField id="create-available" label="Availability">
              <select
                id="create-available"
                value={createForm.available ? 'true' : 'false'}
                disabled={createBusy}
                onChange={(event) =>
                  setCreateForm((previous) => ({
                    ...previous,
                    available: event.target.value === 'true',
                  }))
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
            </FormField>
          </div>

          <FormField id="create-description" label="Description">
            <TextArea
              id="create-description"
              value={createForm.description}
              disabled={createBusy}
              onChange={(value) => setCreateForm((previous) => ({ ...previous, description: value }))}
            />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <MediaUploadField
              id="create-primary-media"
              title="Primary image"
              role="primary"
              required
              disabled={createBusy}
              state={createPrimaryUpload}
              onUpload={(role, file) => uploadMedia(role, file, setCreatePrimaryUpload)}
              onAltTextChange={(value) =>
                setCreatePrimaryUpload((previous) => ({
                  ...previous,
                  altText: value,
                  metadata: applyAltTextToMetadata(previous.metadata, value),
                }))
              }
              onClear={() => setCreatePrimaryUpload(createInitialUploadState())}
            />
            <MediaUploadField
              id="create-secondary-media"
              title="Secondary image"
              role="secondary"
              required={false}
              disabled={createBusy}
              state={createSecondaryUpload}
              onUpload={(role, file) => uploadMedia(role, file, setCreateSecondaryUpload)}
              onAltTextChange={(value) =>
                setCreateSecondaryUpload((previous) => ({
                  ...previous,
                  altText: value,
                  metadata: applyAltTextToMetadata(previous.metadata, value),
                }))
              }
              onClear={() => setCreateSecondaryUpload(createInitialUploadState())}
            />
          </div>

          <StatePanel variant={createStateVariant} title="Create status" description={createOperation.message} />

          {latestCreatedProduct ? (
            <StatePanel
              variant="success"
              title="Latest created product"
              description={`${latestCreatedProduct.name} (${latestCreatedProduct.productId}) | ${latestCreatedProduct.priceCents} cents | stock ${latestCreatedProduct.stock}`}
            />
          ) : null}
        </form>

        <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">OPS-005</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Update product</h3>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-background p-3">
            <FormField id="lookup-product-search" label="Search slugs">
              <TextInput
                id="lookup-product-search"
                value={lookupSearch}
                disabled={lookupState.status === 'loading' || updateBusy || lookupOptionsState.status === 'loading'}
                onChange={setLookupSearch}
                placeholder="Search slug"
              />
            </FormField>
            <FormField id="lookup-product-id" label="Product slug">
              <select
                id="lookup-product-id"
                value={lookupProductId}
                disabled={lookupState.status === 'loading' || updateBusy || lookupOptionsState.status === 'loading'}
                onChange={(event) => setLookupProductId(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="" disabled>
                  {lookupOptions.length > 0 ? 'Select a product slug' : 'No slugs available'}
                </option>
                {lookupOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.slug}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleLookupProduct();
                }}
                disabled={
                  lookupState.status === 'loading'
                  || updateBusy
                  || lookupOptionsState.status === 'loading'
                  || lookupProductId.trim().length === 0
                }
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {lookupState.status === 'loading' ? 'Loading...' : 'Load product'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadLookupOptions();
                }}
                disabled={lookupOptionsState.status === 'loading' || updateBusy}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {lookupOptionsState.status === 'loading' ? 'Refreshing list...' : 'Refresh slug list'}
              </button>
            </div>
            <p
              className={`text-xs ${
                lookupOptionsState.status === 'error'
                  ? 'text-danger'
                  : lookupOptionsState.status === 'success'
                    ? 'text-success'
                    : 'text-muted-foreground'
              }`}
            >
              {lookupOptionsState.message}
            </p>
            <StatePanel
              variant={
                lookupState.status === 'loading'
                  ? 'loading'
                  : lookupState.status === 'error'
                    ? 'error'
                    : lookupState.status === 'success'
                      ? 'success'
                      : 'empty'
              }
              title="Lookup status"
              description={lookupState.message}
            />
          </div>

          <form onSubmit={handleUpdateSubmit} className="space-y-4">
            {loadedProductId ? (
              <p className="text-sm text-muted-foreground">
                Editing: <span className="font-semibold text-foreground">{loadedProductId}</span>
              </p>
            ) : (
              <StatePanel
                variant="disabled"
                title="No product loaded"
                description="Load a product above to enable update fields."
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="update-name" label="Name">
                <TextInput
                  id="update-name"
                  value={updateForm.name}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(value) => setUpdateForm((previous) => ({ ...previous, name: value }))}
                />
              </FormField>
              <FormField id="update-category" label="Category">
                <select
                  id="update-category"
                  value={updateForm.category}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(event) =>
                    setUpdateForm((previous) => ({
                      ...previous,
                      category: event.target.value as ProductEditFormState['category'],
                    }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="tops">Tops</option>
                  <option value="bottoms">Bottoms</option>
                </select>
              </FormField>
              <FormField id="update-gender" label="Gender">
                <select
                  id="update-gender"
                  value={updateForm.gender}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(event) =>
                    setUpdateForm((previous) => ({
                      ...previous,
                      gender: event.target.value as ProductEditFormState['gender'],
                    }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                </select>
              </FormField>
              <FormField id="update-fit" label="Fit">
                <TextInput
                  id="update-fit"
                  value={updateForm.fit}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(value) => setUpdateForm((previous) => ({ ...previous, fit: value }))}
                />
              </FormField>
              <FormField id="update-color" label="Color">
                <TextInput
                  id="update-color"
                  value={updateForm.color}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(value) => setUpdateForm((previous) => ({ ...previous, color: value }))}
                />
              </FormField>
              <FormField id="update-price" label="Price (cents)">
                <TextInput
                  id="update-price"
                  type="number"
                  value={updateForm.priceCents}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(value) => setUpdateForm((previous) => ({ ...previous, priceCents: value }))}
                />
              </FormField>
              <FormField id="update-stock" label="Stock">
                <TextInput
                  id="update-stock"
                  type="number"
                  value={updateForm.stock}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(value) => setUpdateForm((previous) => ({ ...previous, stock: value }))}
                />
              </FormField>
              <FormField id="update-available" label="Availability">
                <select
                  id="update-available"
                  value={updateForm.available ? 'true' : 'false'}
                  disabled={!loadedProductId || updateBusy}
                  onChange={(event) =>
                    setUpdateForm((previous) => ({
                      ...previous,
                      available: event.target.value === 'true',
                    }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="true">Available</option>
                  <option value="false">Unavailable</option>
                </select>
              </FormField>
            </div>

            <FormField id="update-description" label="Description">
              <TextArea
                id="update-description"
                value={updateForm.description}
                disabled={!loadedProductId || updateBusy}
                onChange={(value) => setUpdateForm((previous) => ({ ...previous, description: value }))}
              />
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <MediaUploadField
                id="update-primary-media"
                title="Replace primary image"
                role="primary"
                required={false}
                disabled={!loadedProductId || updateBusy}
                state={updatePrimaryUpload}
                onUpload={(role, file) => uploadMedia(role, file, setUpdatePrimaryUpload)}
                onAltTextChange={(value) =>
                  setUpdatePrimaryUpload((previous) => ({
                    ...previous,
                    altText: value,
                    metadata: applyAltTextToMetadata(previous.metadata, value),
                  }))
                }
                onClear={() => setUpdatePrimaryUpload(createInitialUploadState())}
              />
              <MediaUploadField
                id="update-secondary-media"
                title="Replace secondary image"
                role="secondary"
                required={false}
                disabled={!loadedProductId || updateBusy}
                state={updateSecondaryUpload}
                onUpload={(role, file) => uploadMedia(role, file, setUpdateSecondaryUpload)}
                onAltTextChange={(value) =>
                  setUpdateSecondaryUpload((previous) => ({
                    ...previous,
                    altText: value,
                    metadata: applyAltTextToMetadata(previous.metadata, value),
                  }))
                }
                onClear={() => setUpdateSecondaryUpload(createInitialUploadState())}
              />
            </div>

            <button
              type="submit"
              disabled={!loadedProductId || updateBusy}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updateOperation.status === 'loading' ? 'Updating...' : 'Save updates'}
            </button>

            <StatePanel variant={updateStateVariant} title="Update status" description={updateOperation.message} />
          </form>
        </section>
      </section>
    </section>
  );
}
