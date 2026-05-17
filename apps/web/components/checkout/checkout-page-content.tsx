'use client';

import type {
  AddressRecord,
  CreateAddressInput,
  UpdateAddressInput,
} from '@shoppilot/db/address-contract';
import type { CheckoutSessionResponse } from '@shoppilot/db/checkout-contract';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuthStore } from '../../lib/auth-store';
import {
  createAddress,
  deleteAddress,
  fetchAddresses,
  getAddressErrorMessage,
  updateAddress,
} from '../../lib/address-api';
import {
  createCheckoutPaymentSession,
  fetchCheckoutSession,
  getCheckoutErrorMessage,
  setCheckoutSessionAddress,
  setCheckoutSessionContact,
  startCheckoutSession,
} from '../../lib/checkout-api';
import { reportClientError } from '../../lib/client-error';
import { StatePanel } from '../state-panel';

type CheckoutPageStatus = 'loading' | 'success' | 'error';

type AddressFormState = {
  recipientName: string;
  country: string;
  city: string;
  postalCode: string;
  line1: string;
  line2: string;
  phone: string;
  isDefault: boolean;
};

const emptyAddressForm: AddressFormState = {
  recipientName: '',
  country: 'ET',
  city: '',
  postalCode: '',
  line1: '',
  line2: '',
  phone: '',
  isDefault: false,
};

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function ButtonLabel({
  pending,
  text,
  spinnerClassName,
}: {
  pending: boolean;
  text: string;
  spinnerClassName?: string;
}) {
  if (!pending) {
    return <>{text}</>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${spinnerClassName ?? ''}`}
      />
      <span>{text}</span>
    </span>
  );
}

const checkoutInputClassName =
  'mt-1 h-[58px] w-full rounded-[4px] border border-black/20 bg-white px-3 text-sm text-black/80 outline-none transition-colors placeholder:text-black/55 focus:border-black focus:ring-2 focus:ring-black focus:ring-offset-0';

const checkoutSecondaryButtonClassName =
  'inline-flex h-10 items-center justify-center rounded-full border border-foreground/25 bg-background px-4 font-auth-heading text-[11px] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

const checkoutPrimaryButtonClassName =
  'inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 font-auth-heading text-[11px] font-bold uppercase tracking-[0.08em] text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50';

export function CheckoutPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const clearUser = useAuthStore((state) => state.clearUser);

  const [status, setStatus] = useState<CheckoutPageStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('Unable to load checkout right now.');
  const [retryCounter, setRetryCounter] = useState(0);
  const [session, setSession] = useState<CheckoutSessionResponse | null>(null);
  const [addresses, setAddresses] = useState<AddressRecord[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string>('');

  const [createForm, setCreateForm] = useState<AddressFormState>(emptyAddressForm);
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AddressFormState>(emptyAddressForm);
  const checkoutReadyNotifiedRef = useRef(false);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.addressId === session?.selectedAddressId) ?? null,
    [addresses, session?.selectedAddressId],
  );

  function applySession(nextSession: CheckoutSessionResponse) {
    setSession(nextSession);
    setContactEmail(nextSession.contact.email ?? '');
    setContactPhone(nextSession.contact.phone ?? '');
  }

  function toCreateAddressInput(form: AddressFormState): CreateAddressInput {
    return {
      recipientName: form.recipientName.trim(),
      country: form.country.trim().toUpperCase(),
      city: form.city.trim(),
      postalCode: form.postalCode.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim().length > 0 ? form.line2.trim() : undefined,
      phone: form.phone.trim().length > 0 ? form.phone.trim() : undefined,
      isDefault: form.isDefault,
    };
  }

  function toUpdateAddressInput(form: AddressFormState): UpdateAddressInput {
    return {
      recipientName: form.recipientName.trim(),
      country: form.country.trim().toUpperCase(),
      city: form.city.trim(),
      postalCode: form.postalCode.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim().length > 0 ? form.line2.trim() : undefined,
      phone: form.phone.trim().length > 0 ? form.phone.trim() : undefined,
      isDefault: form.isDefault,
    };
  }

  function isUnauthorized(statusCode: number, code?: string): boolean {
    return statusCode === 401 || code === 'AUTH_UNAUTHORIZED';
  }

  function handleUnauthorized() {
    clearUser();
    router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  useEffect(() => {
    let active = true;

    async function loadCheckout() {
      setStatus('loading');
      setInfoMessage('');

      try {
        const [sessionResponse, addressesResponse] = await Promise.all([
          startCheckoutSession(),
          fetchAddresses(),
        ]);

        if (!active) {
          return;
        }

        if (!sessionResponse.ok) {
          if (isUnauthorized(sessionResponse.status, sessionResponse.code)) {
            handleUnauthorized();
            return;
          }

          setStatus('error');
          setErrorMessage(getCheckoutErrorMessage(sessionResponse.message, sessionResponse.code));
          return;
        }

        if (!addressesResponse.ok) {
          if (isUnauthorized(addressesResponse.status, addressesResponse.code)) {
            handleUnauthorized();
            return;
          }

          setStatus('error');
          setErrorMessage(getAddressErrorMessage(addressesResponse.message, addressesResponse.code));
          return;
        }

        applySession(sessionResponse.data);
        setAddresses(addressesResponse.data.items);
        setStatus('success');
      } catch (error) {
        if (!active) {
          return;
        }

        reportClientError({ error, context: 'checkout:load' });
        setStatus('error');
        setErrorMessage('Unable to load checkout right now.');
      }
    }

    void loadCheckout();

    return () => {
      active = false;
    };
  }, [clearUser, pathname, retryCounter, router]);

  useEffect(() => {
    if (status === 'loading' || checkoutReadyNotifiedRef.current) {
      return;
    }

    checkoutReadyNotifiedRef.current = true;
    window.dispatchEvent(new CustomEvent('checkout:ready'));
  }, [status]);

  async function refreshAddressesAndSession(nextToken?: string) {
    const token = nextToken ?? session?.sessionToken;
    if (!token) {
      return;
    }

    const [addressesResponse, sessionResponse] = await Promise.all([
      fetchAddresses(),
      fetchCheckoutSession(token),
    ]);

    if (!addressesResponse.ok) {
      if (isUnauthorized(addressesResponse.status, addressesResponse.code)) {
        handleUnauthorized();
        return;
      }

      throw new Error(getAddressErrorMessage(addressesResponse.message, addressesResponse.code));
    }

    if (!sessionResponse.ok) {
      if (isUnauthorized(sessionResponse.status, sessionResponse.code)) {
        handleUnauthorized();
        return;
      }

      throw new Error(getCheckoutErrorMessage(sessionResponse.message, sessionResponse.code));
    }

    setAddresses(addressesResponse.data.items);
    applySession(sessionResponse.data);
  }

  async function handleAddressCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.sessionToken) {
      return;
    }

    setPendingAction('address:create');
    setInfoMessage('');

    try {
      const created = await createAddress(toCreateAddressInput(createForm));

      if (!created.ok) {
        if (isUnauthorized(created.status, created.code)) {
          handleUnauthorized();
          return;
        }

        setInfoMessage(getAddressErrorMessage(created.message, created.code));
        return;
      }

      const selectResponse = await setCheckoutSessionAddress(session.sessionToken, {
        addressId: created.data.addressId,
      });

      if (!selectResponse.ok) {
        if (isUnauthorized(selectResponse.status, selectResponse.code)) {
          handleUnauthorized();
          return;
        }

        setInfoMessage(getCheckoutErrorMessage(selectResponse.message, selectResponse.code));
        return;
      }

      applySession(selectResponse.data);
      await refreshAddressesAndSession(selectResponse.data.sessionToken);
      setCreateForm(emptyAddressForm);
    } catch (error) {
      reportClientError({ error, context: 'checkout:create-address' });
      setInfoMessage('Could not save address right now.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAddressSelect(addressId: string) {
    if (!session?.sessionToken) {
      return;
    }

    setPendingAction(`address:select:${addressId}`);
    setInfoMessage('');

    try {
      const response = await setCheckoutSessionAddress(session.sessionToken, { addressId });

      if (!response.ok) {
        if (isUnauthorized(response.status, response.code)) {
          handleUnauthorized();
          return;
        }

        setInfoMessage(getCheckoutErrorMessage(response.message, response.code));
        return;
      }

      applySession(response.data);
    } catch (error) {
      reportClientError({ error, context: 'checkout:select-address' });
      setInfoMessage('Could not select this address right now.');
    } finally {
      setPendingAction(null);
    }
  }

  function beginEdit(address: AddressRecord) {
    setEditingAddressId(address.addressId);
    setEditForm({
      recipientName: address.recipientName,
      country: address.country,
      city: address.city,
      postalCode: address.postalCode,
      line1: address.line1,
      line2: address.line2 ?? '',
      phone: address.phone ?? '',
      isDefault: address.isDefault,
    });
  }

  async function handleAddressUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingAddressId) {
      return;
    }

    setPendingAction(`address:update:${editingAddressId}`);
    setInfoMessage('');

    try {
      const response = await updateAddress(editingAddressId, toUpdateAddressInput(editForm));

      if (!response.ok) {
        if (isUnauthorized(response.status, response.code)) {
          handleUnauthorized();
          return;
        }

        setInfoMessage(getAddressErrorMessage(response.message, response.code));
        return;
      }

      setEditingAddressId(null);
      await refreshAddressesAndSession();
    } catch (error) {
      reportClientError({ error, context: 'checkout:update-address' });
      setInfoMessage('Could not update this address right now.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleAddressDelete(addressId: string) {
    setPendingAction(`address:delete:${addressId}`);
    setInfoMessage('');

    try {
      const response = await deleteAddress(addressId);

      if (!response.ok) {
        if (isUnauthorized(response.status, response.code)) {
          handleUnauthorized();
          return;
        }

        setInfoMessage(getAddressErrorMessage(response.message, response.code));
        return;
      }

      if (editingAddressId === addressId) {
        setEditingAddressId(null);
      }

      await refreshAddressesAndSession();
    } catch (error) {
      reportClientError({ error, context: 'checkout:delete-address' });
      setInfoMessage('Could not delete this address right now.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleContactSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session?.sessionToken) {
      return;
    }

    setPendingAction('contact:save');
    setInfoMessage('');

    try {
      const response = await setCheckoutSessionContact(session.sessionToken, {
        email: contactEmail,
        phone: contactPhone,
      });

      if (!response.ok) {
        if (isUnauthorized(response.status, response.code)) {
          handleUnauthorized();
          return;
        }

        setInfoMessage(getCheckoutErrorMessage(response.message, response.code));
        return;
      }

      applySession(response.data);
    } catch (error) {
      reportClientError({ error, context: 'checkout:save-contact' });
      setInfoMessage('Could not save contact details right now.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePayNow() {
    if (!session?.sessionToken) {
      return;
    }

    setPendingAction('payment:start');
    setInfoMessage('');

    try {
      const response = await createCheckoutPaymentSession(session.sessionToken);

      if (!response.ok) {
        if (isUnauthorized(response.status, response.code)) {
          handleUnauthorized();
          return;
        }

        setInfoMessage(getCheckoutErrorMessage(response.message, response.code));
        return;
      }

      window.location.assign(response.data.checkoutUrl);
    } catch (error) {
      reportClientError({ error, context: 'checkout:start-payment' });
      setInfoMessage('Could not start payment right now. Please retry.');
    } finally {
      setPendingAction(null);
    }
  }

  if (status === 'loading') {
    return (
      <StatePanel
        variant="loading"
        title="Preparing checkout"
        description="Validating your cart and loading your checkout session."
      />
    );
  }

  if (status === 'error' || !session) {
    return (
      <StatePanel
        variant="error"
        title="Checkout unavailable"
        description={errorMessage}
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRetryCounter((count) => count + 1)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => router.push('/catalog')}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back to catalog
          </button>
        </div>
      </StatePanel>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1180px] lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-0">
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:max-w-[640px] lg:px-0 lg:py-8">
        <section className="border-b border-border pb-5">
          <h1 className="font-auth-heading text-xl font-bold uppercase tracking-wide text-foreground">
            Checkout
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete and save your address and contact details to unlock payment in the next subphase.
          </p>

        </section>

        <section className="space-y-4 border-b border-border pb-6">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Shipping address
          </h2>

          {addresses.length === 0 ? (
            <div className="mt-3">
              <StatePanel
                variant="empty"
                title="No saved addresses"
                description="Add an address below to continue checkout."
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {addresses.map((address) => {
                const isSelected = session.selectedAddressId === address.addressId;
                const isPending =
                  pendingAction === `address:select:${address.addressId}`
                  || pendingAction === `address:update:${address.addressId}`
                  || pendingAction === `address:delete:${address.addressId}`;

                return (
                  <li key={address.addressId} className="rounded-[4px] bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{address.recipientName}</p>
                        <p className="text-sm text-muted-foreground">{address.line1}</p>
                        {address.line2 ? <p className="text-sm text-muted-foreground">{address.line2}</p> : null}
                        <p className="text-sm text-muted-foreground">
                          {address.city}, {address.postalCode}, {address.country}
                        </p>
                        {address.phone ? <p className="text-sm text-muted-foreground">{address.phone}</p> : null}
                      </div>
                      <div className="flex gap-2 text-xs">
                        {address.isDefault ? (
                          <span className="rounded-full border border-border bg-muted px-2 py-1 text-foreground">Default</span>
                        ) : null}
                        {isSelected ? (
                          <span className="rounded-full border border-success/40 bg-success/10 px-2 py-1 text-foreground">Selected</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddressSelect(address.addressId)}
                        disabled={isPending || isSelected}
                        aria-busy={pendingAction === `address:select:${address.addressId}`}
                        className={checkoutSecondaryButtonClassName}
                      >
                        <ButtonLabel
                          pending={pendingAction === `address:select:${address.addressId}`}
                          text="Use this address"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => beginEdit(address)}
                        disabled={isPending}
                        className={checkoutSecondaryButtonClassName}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddressDelete(address.addressId)}
                        disabled={isPending}
                        className={checkoutSecondaryButtonClassName}
                      >
                        Delete
                      </button>
                    </div>

                    {editingAddressId === address.addressId ? (
                      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={handleAddressUpdate}>
                        <label className="text-sm text-foreground">
                          Recipient
                          <input
                            value={editForm.recipientName}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, recipientName: event.target.value }))
                            }
                            required
                            className={checkoutInputClassName}
                          />
                        </label>
                        <label className="text-sm text-foreground">
                          Country
                          <input
                            value={editForm.country}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, country: event.target.value }))
                            }
                            required
                            className={checkoutInputClassName}
                          />
                        </label>
                        <label className="text-sm text-foreground">
                          City
                          <input
                            value={editForm.city}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, city: event.target.value }))
                            }
                            required
                            className={checkoutInputClassName}
                          />
                        </label>
                        <label className="text-sm text-foreground">
                          Postal code
                          <input
                            value={editForm.postalCode}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, postalCode: event.target.value }))
                            }
                            required
                            className={checkoutInputClassName}
                          />
                        </label>
                        <label className="text-sm text-foreground sm:col-span-2">
                          Address line 1
                          <input
                            value={editForm.line1}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, line1: event.target.value }))
                            }
                            required
                            className={checkoutInputClassName}
                          />
                        </label>
                        <label className="text-sm text-foreground sm:col-span-2">
                          Address line 2
                          <input
                            value={editForm.line2}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, line2: event.target.value }))
                            }
                            className={checkoutInputClassName}
                          />
                        </label>
                        <label className="text-sm text-foreground">
                          Phone
                          <input
                            value={editForm.phone}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, phone: event.target.value }))
                            }
                            className={checkoutInputClassName}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={editForm.isDefault}
                            onChange={(event) =>
                              setEditForm((current) => ({ ...current, isDefault: event.target.checked }))
                            }
                          />
                          Set as default
                        </label>
                        <div className="sm:col-span-2 flex gap-2">
                          <button
                            type="submit"
                            disabled={pendingAction === `address:update:${address.addressId}`}
                            aria-busy={pendingAction === `address:update:${address.addressId}`}
                            className={checkoutSecondaryButtonClassName}
                          >
                            <ButtonLabel
                              pending={pendingAction === `address:update:${address.addressId}`}
                              text="Save changes"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAddressId(null)}
                            className={checkoutSecondaryButtonClassName}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <form className="mt-4 grid gap-2 bg-white p-0 sm:grid-cols-2" onSubmit={handleAddressCreate}>
            <h3 className="sm:col-span-2 font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-foreground">Add new address</h3>
            <label className="text-sm text-foreground">
              Recipient
              <input
                value={createForm.recipientName}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, recipientName: event.target.value }))
                }
                required
                className={checkoutInputClassName}
              />
            </label>
            <label className="text-sm text-foreground">
              Country
              <input
                value={createForm.country}
                onChange={(event) => setCreateForm((current) => ({ ...current, country: event.target.value }))}
                required
                className={checkoutInputClassName}
              />
            </label>
            <label className="text-sm text-foreground">
              City
              <input
                value={createForm.city}
                onChange={(event) => setCreateForm((current) => ({ ...current, city: event.target.value }))}
                required
                className={checkoutInputClassName}
              />
            </label>
            <label className="text-sm text-foreground">
              Postal code
              <input
                value={createForm.postalCode}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, postalCode: event.target.value }))
                }
                required
                className={checkoutInputClassName}
              />
            </label>
            <label className="text-sm text-foreground sm:col-span-2">
              Address line 1
              <input
                value={createForm.line1}
                onChange={(event) => setCreateForm((current) => ({ ...current, line1: event.target.value }))}
                required
                className={checkoutInputClassName}
              />
            </label>
            <label className="text-sm text-foreground sm:col-span-2">
              Address line 2
              <input
                value={createForm.line2}
                onChange={(event) => setCreateForm((current) => ({ ...current, line2: event.target.value }))}
                className={checkoutInputClassName}
              />
            </label>
            <label className="text-sm text-foreground">
              Phone
              <input
                value={createForm.phone}
                onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))}
                className={checkoutInputClassName}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={createForm.isDefault}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, isDefault: event.target.checked }))
                }
              />
              Set as default
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pendingAction === 'address:create'}
                aria-busy={pendingAction === 'address:create'}
                className={`${checkoutPrimaryButtonClassName} min-w-[150px]`}
              >
                <ButtonLabel
                  pending={pendingAction === 'address:create'}
                  text="Save address"
                  spinnerClassName="border-foreground border-t-transparent"
                />
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-4 border-b border-border pb-6">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Contact
          </h2>
          <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={handleContactSave}>
            <label className="text-sm text-foreground sm:col-span-2">
              Email
              <input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                required
                className={checkoutInputClassName}
              />
            </label>
            <label className="text-sm text-foreground sm:col-span-2">
              Phone
              <input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                required
                className={checkoutInputClassName}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={pendingAction === 'contact:save'}
                aria-busy={pendingAction === 'contact:save'}
                className={`${checkoutPrimaryButtonClassName} min-w-[150px]`}
              >
                <ButtonLabel
                  pending={pendingAction === 'contact:save'}
                  text="Save contact"
                  spinnerClassName="border-foreground border-t-transparent"
                />
              </button>
            </div>
            <div className="sm:col-span-2 mt-2 flex items-center justify-end gap-3 border-t border-border pt-4 text-sm">
              <button
                type="button"
                disabled={session.readinessStatus === 'blocked' || pendingAction === 'payment:start'}
                onClick={handlePayNow}
                className={`${checkoutPrimaryButtonClassName} min-w-[132px]`}
                aria-busy={pendingAction === 'payment:start'}
              >
                <ButtonLabel pending={pendingAction === 'payment:start'} text="Pay now" />
              </button>
            </div>
          </form>
        </section>

        {infoMessage ? (
          <StatePanel variant="success" title="Status" description={infoMessage} />
        ) : null}
      </div>

      <aside className="mt-6 border-t border-border bg-muted px-4 py-6 sm:px-6 lg:mt-0 lg:border-l lg:border-t-0 lg:px-10 lg:py-10">
        <section className="bg-background p-5">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Items in this order
          </h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {session.cartSnapshot.items.map((item) => (
              <li key={item.itemId} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-foreground">{item.name}</p>
                  <p className="text-muted-foreground">Qty {item.quantity}</p>
                </div>
                <p className="font-semibold text-foreground">
                  {formatMoney(item.lineSubtotalCents, item.currency)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4 bg-background p-5">
          <h2 className="font-auth-heading text-sm font-bold uppercase tracking-wider text-foreground">
            Order summary
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3 text-muted-foreground">
              <dt>Sub Total</dt>
              <dd>{formatMoney(session.pricing.subtotalCents, session.pricing.currency)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-muted-foreground">
              <dt>Estimated Shipping</dt>
              <dd>{formatMoney(session.pricing.shippingCents, session.pricing.currency)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-muted-foreground">
              <dt>
                Estimated Tax
                <span className="ml-1 text-xs">({(session.pricing.taxRate * 100).toFixed(2)}%)</span>
              </dt>
              <dd>{formatMoney(session.pricing.taxCents, session.pricing.currency)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2 font-semibold text-foreground">
              <dt>Total</dt>
              <dd>{formatMoney(session.pricing.totalCents, session.pricing.currency)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 bg-background p-5">
          <h2 className="font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-foreground">
            Selected address
          </h2>
          {selectedAddress ? (
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">{selectedAddress.recipientName}</p>
              <p>{selectedAddress.line1}</p>
              {selectedAddress.line2 ? <p>{selectedAddress.line2}</p> : null}
              <p>
                {selectedAddress.city}, {selectedAddress.postalCode}, {selectedAddress.country}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No address selected yet.</p>
          )}
        </section>
      </aside>
    </section>
  );
}
