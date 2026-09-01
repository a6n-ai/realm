/**
 * Clover Customers API types + normalizers.
 *
 * Platform paths (sandbox `apisandbox.dev.clover.com`, prod `api.clover.com`):
 * - GET       /v3/merchants/{mId}/customers
 * - GET       /v3/merchants/{mId}/customers/{id}  (?expand=addresses,emailAddresses,phoneNumbers,metadata)
 * - POST      /v3/merchants/{mId}/customers        (create)
 * - POST      /v3/merchants/{mId}/customers/{id}   (update)
 *
 * Create is used to push app customers to Clover (see
 * push-customers-to-clover.service.ts); update/delete still aren't called
 * from anywhere since this app has no local "edit a Clover customer" UI.
 */

export type CloverCustomerEmail = { emailAddress: string; primaryEmail?: boolean };
export type CloverCustomerPhone = { phoneNumber: string };

/** Customer as returned by Platform API `/customers`. */
export type CloverCustomer = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Derived display name — Clover has no single "name" field on this entity. */
  name: string;
  marketingAllowed?: boolean;
  /** Epoch ms. */
  customerSince?: number | null;
  email?: string | null;
  phone?: string | null;
};

export type CloverCustomerCreateInput = {
  firstName?: string;
  lastName?: string;
  marketingAllowed?: boolean;
  email?: string;
  phone?: string;
};

/** Clover wants email/phone as nested elements, not flat fields — see normalizeCloverCustomer's mirror reads. */
export function buildCustomerCreateBody(input: CloverCustomerCreateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: input.firstName,
    lastName: input.lastName,
    marketingAllowed: input.marketingAllowed,
  };
  if (input.email) {
    body.emailAddresses = { elements: [{ emailAddress: input.email, primaryEmail: true }] };
  }
  if (input.phone) {
    body.phoneNumbers = { elements: [{ phoneNumber: input.phone }] };
  }
  return body;
}

export type ListCustomersParams = {
  limit?: number;
  offset?: number;
  /** Comma-separated expansions, e.g. `emailAddresses,phoneNumbers`. */
  expand?: string;
  filter?: string;
};

function optString(v: unknown): string | null | undefined {
  return typeof v === "string" ? v : v === null ? null : undefined;
}

function optBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function optNullableNumber(v: unknown): number | null | undefined {
  if (v === null) return null;
  return typeof v === "number" ? v : undefined;
}

function firstEmail(o: Record<string, unknown>): string | null {
  const list = (o.emailAddresses as { elements?: unknown[] } | undefined)?.elements;
  if (!Array.isArray(list) || list.length === 0) return null;
  const primary = list.find((e) => (e as { primaryEmail?: boolean })?.primaryEmail === true) ?? list[0];
  const addr = (primary as { emailAddress?: unknown })?.emailAddress;
  return typeof addr === "string" ? addr : null;
}

function firstPhone(o: Record<string, unknown>): string | null {
  const list = (o.phoneNumbers as { elements?: unknown[] } | undefined)?.elements;
  if (!Array.isArray(list) || list.length === 0) return null;
  const num = (list[0] as { phoneNumber?: unknown })?.phoneNumber;
  return typeof num === "string" ? num : null;
}

/** Normalize a raw Platform API customer (throws if id missing). */
export function normalizeCloverCustomer(raw: unknown): CloverCustomer {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Clover customer payload");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) throw new Error("Clover customer missing id");

  const firstName = optString(o.firstName) ?? null;
  const lastName = optString(o.lastName) ?? null;
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "(no name)";

  return {
    id,
    firstName,
    lastName,
    name,
    marketingAllowed: optBool(o.marketingAllowed),
    customerSince: optNullableNumber(o.customerSince),
    email: firstEmail(o),
    phone: firstPhone(o),
  };
}
