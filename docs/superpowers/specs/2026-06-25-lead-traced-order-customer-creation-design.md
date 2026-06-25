# Lead-traced Order & Customer creation

**Date:** 2026-06-25
**Status:** Approved

## Problem

A salesperson can only create an inquiry today. To create an order or a customer
they must first manually create an inquiry, then convert it. There is no
standalone "New order" or "New customer" entry point, and nothing guarantees
source attribution flows onto the resulting order/customer. We want salespeople
to create an order or a customer directly, while every such record stays traceable
to a lead (an inquiry) that carries the source.

## Core principle (unchanged)

Inquiry is the lead-of-record. Today `inquiriesService.convert()` turns an inquiry
into an order, and `createOrder()` provisions the customer by phone. This design
generalizes that: orders and customers are always born from an inquiry, so source
attribution is never lost. Almost no new domain logic — the new entry points
*compose* existing services.

## Inquiry resolution rule (single source of truth)

New method `inquiriesService.resolveForSource({ phone, sourceKey, contact, interest, pickedId? })`
returns an `inquiryId`. This is the one place the dedup rule lives; both the Order
and Customer flows call it.

1. `pickedId` provided (salesperson clicked "Use this") → use that inquiry.
   Reject with a validation error if it is already converted.
2. Else if an **open** inquiry exists with **same phone + same source + not converted/lost**
   → reuse it (this realizes the "always reuse" rule).
3. Else → `createInquiry` with the chosen source and contact/interest.

"Open" = stage is not `converted` and not `lost`.

## Backend additions

### `inquiriesService.findOpenByPhone(phone)`
Returns non-terminal inquiries for a phone number, shaped for the match list:
`{ publicId, sourceKey, sourceLabel, stage, createdAt }[]`, newest first. Excludes
`converted` and `lost`. Drives the live `<InquiryMatch>` widget.

### Shared customer provisioning
Extract the user+account provisioning block currently inline in
`orders.service.ts` (~lines 101–122 — find-by-phone, insert user, insert credential
account, handle email clash and onConflict race) into a shared helper
`provisionCustomerByPhone(tx, contact, createdBy)` in `customers.service.ts` (or a
shared module). `createOrder` calls it instead of the inline block — behavior
identical, just deduplicated.

### `customersService.create(contact, { actorId })`
The customer-only path (no order). Opens a transaction and calls
`provisionCustomerByPhone`. Idempotent by phone — returns the existing customer if
the phone already maps to one.

## Orchestration server actions

- `createOrderFlow({ source, contact, interest, pickedInquiryId?, order })`
  → `resolveForSource(...)` → `convert(inquiryId, order)` (which runs `createOrder`,
  provisioning the customer) → redirect `/activate/:deploymentId`.
- `createCustomerFlow({ source, contact, pickedInquiryId? })`
  → `resolveForSource(...)` → `customersService.create(contact)`. Inquiry stays at
  its current stage (`new` for a freshly created one). Returns the customer
  publicId so the UI can offer step-2 "add order" (which then calls `createOrderFlow`
  with the same resolved inquiry).

All actions call `requireStaff()` and `revalidatePath` the affected lists.

## UI

### `<InquiryMatch>` (one reusable client component)
Props: current `phone`, current `sourceKey`, and `onPick(inquiryId | null)`.
- Debounced lookup via a `findOpenByPhone` server action once the phone parses valid.
- Renders the match list: each row shows source · stage · age + a "Use this" action.
- If a match has the **same source** as currently selected and is open, it is
  auto-selected and the source field is locked to it, with a note: changing the
  source branches a new inquiry. Realizes the "always reuse on same source" rule
  visibly.
- A "Create new inquiry instead" affordance clears the pick.

### New Order sheet (trigger on `/dashboard/orders`)
Source pills + contact + `<InquiryMatch>` + existing `OrderForm` fields. Submit →
`createOrderFlow`. Reuses the source-pills UI and `SectionLabel` from
`new-inquiry-form.tsx`, plus `OrderForm` and `PhoneInput`.

### New Customer sheet (trigger on `/dashboard/customers`)
Step 1: source + contact + `<InquiryMatch>`. Two buttons: **Save** and
**Save & add order →**.
- Save → `createCustomerFlow`, close.
- Save & add order → `createCustomerFlow`, then reveal step 2 = reused `OrderForm`
  pre-filled with the contact; submit → `createOrderFlow` with the resolved inquiry.

### Inquiry-detail ConvertSheet
Unchanged — already source-correct.

## Data flow (New Order)

```
phone typed → findOpenByPhone → match list
            → (auto-select + lock source if same-source open match)
submit → createOrderFlow → resolveForSource → convert(inquiryId, order)
       → createOrder provisions customer → redirect /activate/:deploymentId
```

## Error handling

- Reusing a converted inquiry → `ValidationError` from `resolveForSource`.
- Email already in use → existing guard inside `createOrder`/provisioning.
- Out-of-delivery-zone → order `waitlisted` (existing behavior, unchanged).
- Invalid phone/email → existing zod/`phoneSchema` guards.

## Testing (live-DB harness, per project convention)

- `resolveForSource`: same source reuses; different source creates new; converted
  inquiry rejected for reuse; `pickedId` honored.
- `findOpenByPhone`: excludes `converted` and `lost`; orders newest first.
- `customersService.create`: provisions user+account; idempotent by phone (second
  call returns same customer).
- Regression: `createOrder` still provisions a customer after the helper extraction.

Never delete shared fixtures (`usr_system`); re-seed via the documented harness.

## Out of scope

- Bulk import / CSV.
- Editing source after conversion.
- Merging duplicate inquiries across different sources (sales chooses explicitly).
