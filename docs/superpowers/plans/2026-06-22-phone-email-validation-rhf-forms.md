# Phone/Email Validation + RHF Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared phone/email validation layer (zod + libphonenumber-js) used by both client and server, a country-aware phone input defaulting to the app's configured timezone, and migrate the data-entry forms to react-hook-form with canonical E.164 phone storage.

**Architecture:** Validation primitives live in `@tiffin/commons` (framework-agnostic, run in browser + Node). A `PhoneInput` shadcn component (react-phone-number-input) renders the country picker; its `defaultCountry` is derived server-side from `app-settings.timezone`. Each data-entry form uses `useForm` + `zodResolver` following the existing `login-form.tsx` pattern, and every server action re-validates with the same schema before writing.

**Tech Stack:** zod v4, libphonenumber-js, react-phone-number-input, react-hook-form 7 + @hookform/resolvers, shadcn/ui (`Form`, `Command`, `Popover`, `ScrollArea`), Next.js (App Router), vitest.

## Global Constraints

- Shared code goes in `@tiffin/commons{,-drizzle,-next}`, NOT `apps/web` (commons convention). Validation **primitives** (`phoneSchema`, `emailSchema`, `tzToDefaultCountry`) live in commons; per-form schema **composition** may live in `apps/web` next to its action.
- Phone is stored canonical **E.164** (`+16475550100`) on all new writes. Phone columns are `text`; NO DB migration; existing rows untouched.
- zod major must match the repo pin (`zod@4.4.3`). Commons uses the same major.
- `login-form.tsx` is the reference RHF pattern; `components/ui/form.tsx` already exists. Login is already migrated — out of scope.
- Server actions keep throwing `ValidationError` (from `@tiffin/commons`) on bad input — preserve the existing error contract.
- No unnecessary comments; comment only non-obvious WHY.
- Commons has no build step — it exports `./src/index.ts` directly; new modules must be re-exported from `packages/commons/src/index.ts`.
- The session caveman hook mangles some tool-output strings (`timezone`→`n`). Read source files directly when exact strings matter; never trust grep'd string literals.

---

## Phase 1 — Commons validation layer

### Task 1: Add validation dependencies to commons

**Files:**
- Modify: `packages/commons/package.json`

**Interfaces:**
- Produces: `zod`, `libphonenumber-js` importable from `@tiffin/commons` source.

- [ ] **Step 1: Add deps**

Edit `packages/commons/package.json` to add a `dependencies` block (it currently has only `devDependencies`):

```json
  "dependencies": {
    "zod": "^4.4.3",
    "libphonenumber-js": "^1.11.0"
  },
```

Place it before the existing `"devDependencies"` key.

- [ ] **Step 2: Install from repo root**

Run: `pnpm install`
Expected: lockfile updates, `libphonenumber-js` added; no errors.

- [ ] **Step 3: Verify resolution**

Run: `cd packages/commons && pnpm exec tsc --noEmit`
Expected: PASS (exit 0) — no new type errors from the dependency change.

- [ ] **Step 4: Commit**

```bash
git add packages/commons/package.json pnpm-lock.yaml
git commit -m "build(commons): add zod + libphonenumber-js for shared validation"
```

---

### Task 2: Email validation primitive

**Files:**
- Create: `packages/commons/src/util/contact.ts`
- Test: `packages/commons/src/util/contact.test.ts`

**Interfaces:**
- Produces: `emailSchema: z.ZodType<string>` — trims, lowercases, validates email; `normalizeEmail(email: string): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/commons/src/util/contact.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emailSchema, normalizeEmail } from "./contact";

describe("emailSchema", () => {
  it("accepts and normalizes a valid email", () => {
    expect(emailSchema.parse("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("rejects a malformed email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/commons && pnpm exec vitest run src/util/contact.test.ts`
Expected: FAIL — cannot find module `./contact`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/commons/src/util/contact.ts`:

```ts
import { z } from "zod";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email"));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/commons && pnpm exec vitest run src/util/contact.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/commons/src/util/contact.ts packages/commons/src/util/contact.test.ts
git commit -m "feat(commons): email validation primitive"
```

---

### Task 3: Phone validation primitive (E.164)

**Files:**
- Modify: `packages/commons/src/util/contact.ts`
- Test: `packages/commons/src/util/contact.test.ts`

**Interfaces:**
- Consumes: `libphonenumber-js` (`isValidPhoneNumber`, `parsePhoneNumber`, `CountryCode`).
- Produces: `phoneSchema(defaultCountry?: CountryCode): z.ZodType<string>` — factory returning a schema that validates per-country and transforms to E.164. Default country `"CA"`.

- [ ] **Step 1: Write the failing test**

Append to `packages/commons/src/util/contact.test.ts`:

```ts
import { phoneSchema } from "./contact";

describe("phoneSchema", () => {
  it("accepts a national CA number and outputs E.164", () => {
    expect(phoneSchema("CA").parse("647 555 0100")).toBe("+16475550100");
  });
  it("accepts an already-E.164 number regardless of default country", () => {
    expect(phoneSchema("IN").parse("+16475550100")).toBe("+16475550100");
  });
  it("accepts a national IN number with IN default", () => {
    expect(phoneSchema("IN").parse("9833098330")).toBe("+919833098330");
  });
  it("rejects garbage", () => {
    expect(phoneSchema("CA").safeParse("12").success).toBe(false);
  });
  it("defaults to CA when no country given", () => {
    expect(phoneSchema().parse("647 555 0100")).toBe("+16475550100");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/commons && pnpm exec vitest run src/util/contact.test.ts`
Expected: FAIL — `phoneSchema` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `packages/commons/src/util/contact.ts`:

```ts
import { isValidPhoneNumber, parsePhoneNumber, type CountryCode } from "libphonenumber-js";

export function phoneSchema(defaultCountry: CountryCode = "CA") {
  return z
    .string()
    .trim()
    .refine((v) => isValidPhoneNumber(v, defaultCountry), "Enter a valid phone number")
    .transform((v) => parsePhoneNumber(v, defaultCountry)!.format("E.164"));
}
```

(Add the `import` at the top of the file alongside the existing `import { z }`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/commons && pnpm exec vitest run src/util/contact.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/commons/src/util/contact.ts packages/commons/src/util/contact.test.ts
git commit -m "feat(commons): phone validation primitive with E.164 transform"
```

---

### Task 4: Timezone → default country mapping

**Files:**
- Modify: `packages/commons/src/util/contact.ts`
- Test: `packages/commons/src/util/contact.test.ts`

**Interfaces:**
- Produces: `tzToDefaultCountry(timezone: string): CountryCode`.

- [ ] **Step 1: Write the failing test**

Append to `packages/commons/src/util/contact.test.ts`:

```ts
import { tzToDefaultCountry } from "./contact";

describe("tzToDefaultCountry", () => {
  it("maps Canadian zones to CA", () => {
    expect(tzToDefaultCountry("America/Toronto")).toBe("CA");
    expect(tzToDefaultCountry("America/Vancouver")).toBe("CA");
  });
  it("maps Asia/Kolkata to IN", () => {
    expect(tzToDefaultCountry("Asia/Kolkata")).toBe("IN");
  });
  it("falls back to CA for UTC / unknown", () => {
    expect(tzToDefaultCountry("UTC")).toBe("CA");
    expect(tzToDefaultCountry("Europe/Paris")).toBe("CA");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/commons && pnpm exec vitest run src/util/contact.test.ts`
Expected: FAIL — `tzToDefaultCountry` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `packages/commons/src/util/contact.ts`:

```ts
export function tzToDefaultCountry(timezone: string): CountryCode {
  if (timezone === "Asia/Kolkata") return "IN";
  return "CA";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/commons && pnpm exec vitest run src/util/contact.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/commons/src/util/contact.ts packages/commons/src/util/contact.test.ts
git commit -m "feat(commons): timezone-to-default-country mapping"
```

---

### Task 5: Export the contact module

**Files:**
- Modify: `packages/commons/src/index.ts`

**Interfaces:**
- Produces: `emailSchema`, `normalizeEmail`, `phoneSchema`, `tzToDefaultCountry` importable from `@tiffin/commons`.

- [ ] **Step 1: Add the export**

Append to `packages/commons/src/index.ts`:

```ts
export * from "./util/contact";
```

- [ ] **Step 2: Verify it resolves from the web app**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 3: Commit**

```bash
git add packages/commons/src/index.ts
git commit -m "feat(commons): export contact validation module"
```

---

## Phase 2 — Phone input component

### Task 6: Add the `PhoneInput` shadcn component

**Files:**
- Modify: `apps/web/package.json` (dep)
- Create: `apps/web/components/ui/phone-input.tsx`
- Possibly create (via shadcn CLI): `apps/web/components/ui/command.tsx`, `popover.tsx`, `scroll-area.tsx`

**Interfaces:**
- Produces: `PhoneInput` — controlled input; props `value?: string` (E.164), `onChange: (value?: string) => void`, `defaultCountry?: CountryCode`, plus standard input props. Designed to wrap with RHF `<Controller>`.

- [ ] **Step 1: Install the phone library**

Run: `cd apps/web && pnpm add react-phone-number-input`
Expected: dependency added.

- [ ] **Step 2: Ensure required shadcn primitives exist**

Check which of `command.tsx`, `popover.tsx`, `scroll-area.tsx` already exist:

Run: `ls apps/web/components/ui/{command,popover,scroll-area}.tsx 2>/dev/null`

For any that are missing, add them:

Run: `cd apps/web && pnpm dlx shadcn@latest add command popover scroll-area`
Expected: missing components written to `components/ui/`. (Already-present ones can be skipped/overwritten identically.)

- [ ] **Step 3: Create the component**

Create `apps/web/components/ui/phone-input.tsx`:

```tsx
"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDown } from "lucide-react";
import * as RPNInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type PhoneInputProps = Omit<React.ComponentProps<"input">, "onChange" | "value" | "ref"> &
  Omit<RPNInput.Props<typeof RPNInput.default>, "onChange"> & {
    onChange?: (value: RPNInput.Value) => void;
  };

const PhoneInput: React.ForwardRefExoticComponent<PhoneInputProps> = React.forwardRef<
  React.ElementRef<typeof RPNInput.default>,
  PhoneInputProps
>(({ className, onChange, ...props }, ref) => (
  <RPNInput.default
    ref={ref}
    className={cn("flex", className)}
    flagComponent={FlagComponent}
    countrySelectComponent={CountrySelect}
    inputComponent={InputComponent}
    smartCaret={false}
    onChange={(value) => onChange?.(value || ("" as RPNInput.Value))}
    {...props}
  />
));
PhoneInput.displayName = "PhoneInput";

const InputComponent = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <Input className={cn("rounded-e-md rounded-s-none", className)} {...props} ref={ref} />
  ),
);
InputComponent.displayName = "InputComponent";

type CountrySelectOption = { label: string; value: RPNInput.Country };

type CountrySelectProps = {
  disabled?: boolean;
  value: RPNInput.Country;
  onChange: (value: RPNInput.Country) => void;
  options: CountrySelectOption[];
};

function CountrySelect({ disabled, value, onChange, options }: CountrySelectProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="flex gap-1 rounded-e-none rounded-s-md px-3"
          disabled={disabled}
        >
          <FlagComponent country={value} countryName={value} />
          <ChevronsUpDown className={cn("-mr-2 size-4 opacity-50", disabled ? "hidden" : "opacity-100")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <ScrollArea className="h-72">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {options
                  .filter((x) => x.value)
                  .map((option) => (
                    <CommandItem
                      key={option.value}
                      className="gap-2"
                      onSelect={() => onChange(option.value)}
                    >
                      <FlagComponent country={option.value} countryName={option.label} />
                      <span className="flex-1 text-sm">{option.label}</span>
                      <span className="text-sm text-foreground/50">
                        {`+${RPNInput.getCountryCallingCode(option.value)}`}
                      </span>
                      <CheckIcon
                        className={cn("ml-auto size-4", option.value === value ? "opacity-100" : "opacity-0")}
                      />
                    </CommandItem>
                  ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FlagComponent({ country, countryName }: RPNInput.FlagProps) {
  const Flag = flags[country];
  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm bg-foreground/20">
      {Flag && <Flag title={countryName} />}
    </span>
  );
}

export { PhoneInput };
```

- [ ] **Step 4: Import the library stylesheet once (global)**

In `apps/web/app/globals.css` (or the existing global stylesheet), add near the top:

```css
@import "react-phone-number-input/style.css";
```

Verify the global stylesheet path first:
Run: `ls apps/web/app/globals.css`
(If the global CSS lives elsewhere, add the import there instead.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/components/ui/ apps/web/app/globals.css
git commit -m "feat(web): add country-aware PhoneInput component"
```

---

## Phase 3 — Backend validation enforcement

> Server actions/services re-validate with the same primitives. Because the client now sends E.164, backend `defaultCountry` is effectively irrelevant (E.164 is unambiguous); default `"CA"`.

### Task 7: Validate inquiry contact in `inquiriesService.create`

**Files:**
- Modify: `apps/web/lib/services/inquiries.service.ts`
- Test: `apps/web/lib/services/__tests__/inquiries.service.test.ts`

**Interfaces:**
- Consumes: `phoneSchema`, `emailSchema` from `@tiffin/commons`; `ValidationError`.
- Produces: `create` throws `ValidationError` on invalid phone/email; stores E.164 phone and normalized email.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/lib/services/__tests__/inquiries.service.test.ts` (inside the existing `describe`):

```ts
it("rejects an invalid phone", async () => {
  await expect(
    inquiriesService.create({ fullName: "X", phone: "12", source: "manual" }),
  ).rejects.toThrow(/phone/i);
});

it("stores phone as E.164", async () => {
  const inq = await inquiriesService.create({ fullName: "X", phone: "647 555 0100", source: "manual" });
  const [row] = await db.select().from(inquiries).where(eq(inquiries.publicId, inq.publicId));
  expect(row.phone).toBe("+16475550100");
});
```

(Ensure `inquiries`, `db`, `eq` are imported in the test file — `db` and `eq` already are; add `inquiries` to the `@/db/schema` import if absent.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run lib/services/__tests__/inquiries.service.test.ts`
Expected: FAIL — phone stored verbatim / no error thrown.

- [ ] **Step 3: Implement validation in `create`**

In `inquiries.service.ts`, locate the `create` override. At the top of it, normalize and validate before delegating to `super.create`:

```ts
import { ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";

// inside create(input):
const phone = phoneSchema().safeParse(input.phone);
if (!phone.success) throw new ValidationError("Enter a valid phone number");
const email = input.email ? emailSchema.safeParse(input.email) : null;
if (email && !email.success) throw new ValidationError("Enter a valid email");
// pass phone.data (E.164) and email?.data into the existing create payload
```

Replace the raw `input.phone` / `input.email` in the create payload with `phone.data` and `email ? email.data : null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run lib/services/__tests__/inquiries.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/inquiries.service.ts apps/web/lib/services/__tests__/inquiries.service.test.ts
git commit -m "feat(inquiries): validate + normalize contact to E.164 on create"
```

---

### Task 8: Validate order contact in `createOrder`

**Files:**
- Modify: `apps/web/lib/services/orders.service.ts`
- Test: `apps/web/lib/services/__tests__/orders.service.test.ts`

**Interfaces:**
- Consumes: `phoneSchema`, `emailSchema`, `ValidationError`.
- Produces: `createOrder` throws on invalid phone/email; persists E.164 phone + normalized email.

- [ ] **Step 1: Write the failing test**

Add to `orders.service.test.ts`:

```ts
it("rejects an order with an invalid phone", async () => {
  const snap = await loadCatalogSnapshot();
  const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
  input.contact.phone = "12";
  await expect(createOrder(input)).rejects.toThrow(/phone/i);
});

it("stores order phone as E.164", async () => {
  const snap = await loadCatalogSnapshot();
  const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
  input.contact.phone = "647 555 0100";
  const { deploymentId } = await createOrder(input);
  const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
  expect(o.phone).toBe("+16475550100");
});
```

(Confirm the order row column holding the phone — read `orders.service.ts` to see the exact `values({ ... fullName, ... })` payload key for phone, and assert that column. If the column is `phone`, the above is correct.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run lib/services/__tests__/orders.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement validation in `createOrder`**

In `createOrder`, before the `tx.insert(orders)` call, validate and normalize the contact:

```ts
import { ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";

// near the top of createOrder, after destructuring input.contact:
const parsedPhone = phoneSchema().safeParse(input.contact.phone);
if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
const phone = parsedPhone.data;
let email: string | null = null;
if (input.contact.email) {
  const parsedEmail = emailSchema.safeParse(input.contact.email);
  if (!parsedEmail.success) throw new ValidationError("Enter a valid email");
  email = parsedEmail.data;
}
```

Use `phone` (E.164) wherever `input.contact.phone` currently feeds the customer lookup (`users.phone` match) and the order insert; use `email` for the order's email column.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run lib/services/__tests__/orders.service.test.ts`
Expected: PASS (existing tests still green — they already use `+1...`-style or 10-digit phones; if a baseline test used a non-parseable phone, update it to `"647 555 0100"`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/orders.service.ts apps/web/lib/services/__tests__/orders.service.test.ts
git commit -m "feat(orders): validate + normalize contact to E.164 in createOrder"
```

---

### Task 9: Validate self-service contact in `usersService.updateContact`

**Files:**
- Modify: `apps/web/lib/services/users.service.ts` (or `users-writable.ts` — whichever defines `updateContact`)
- Test: `apps/web/lib/services/__tests__/users-contact.test.ts`

**Interfaces:**
- Consumes: `phoneSchema`, `emailSchema`, `ValidationError`.
- Produces: `updateContact` throws on invalid input; stores E.164 + normalized email.

- [ ] **Step 1: Locate `updateContact`**

Run: `cd apps/web && rg -n "updateContact" lib/services`
Read the defining file to see the current body and how `users-contact.ts` helpers are used.

- [ ] **Step 2: Write the failing test**

Add to `users-contact.test.ts` a case asserting that an invalid phone is rejected and a national number is stored E.164 (mirror Task 7's two assertions against the user row). Use the existing test's setup/imports as the template.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run lib/services/__tests__/users-contact.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

In `updateContact`, replace the old `isValidCaPhone`/`normalizeEmail` usage with:

```ts
import { ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";

if (input.phone !== undefined) {
  const p = phoneSchema().safeParse(input.phone);
  if (!p.success) throw new ValidationError("Enter a valid phone number");
  input.phone = p.data;
}
if (input.email !== undefined && input.email !== "") {
  const e = emailSchema.safeParse(input.email);
  if (!e.success) throw new ValidationError("Enter a valid email");
  input.email = e.data;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run lib/services/__tests__/users-contact.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/services/ apps/web/lib/services/__tests__/users-contact.test.ts
git commit -m "feat(users): validate + normalize contact to E.164 in updateContact"
```

---

### Task 10: Retire `isValidCaPhone`; route contact action through schema

**Files:**
- Modify: `apps/web/app/(marketing)/contact/actions.ts`
- Modify: `apps/web/lib/services/users-contact.ts`
- Test: `apps/web/app/(marketing)/contact/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `phoneSchema`, `emailSchema` from `@tiffin/commons`.
- Produces: `users-contact.ts` no longer exports `isValidCaPhone`; `createWebsiteInquiry` validates via schema.

- [ ] **Step 1: Update the failing test**

In `contact/__tests__/actions.test.ts`, ensure there is a case that an invalid phone throws `ValidationError` and a national number is accepted (the inquiry is created with E.164). Adjust any existing case that asserted the old regex behavior.

- [ ] **Step 2: Run test to verify current behavior**

Run: `cd apps/web && pnpm exec vitest run "app/(marketing)/contact/__tests__/actions.test.ts"`
Expected: FAIL on the new/updated expectations.

- [ ] **Step 3: Update the action**

In `contact/actions.ts` replace the `isValidCaPhone` import + check:

```ts
import { ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";

// replace the phone check:
const parsedPhone = phoneSchema().safeParse(input.phone.trim());
if (!parsedPhone.success) throw new ValidationError("Invalid phone number");
const phone = parsedPhone.data;
// when present, validate email too:
let email: string | null = null;
if (input.email?.trim()) {
  const e = emailSchema.safeParse(input.email);
  if (!e.success) throw new ValidationError("Enter a valid email");
  email = e.data;
}
```

Pass `phone` and `email` into the `inquiriesService.create({ ... })` call (replacing `phone` and `input.email?.trim() || null`). Note: `inquiriesService.create` now also validates (Task 7) — that is intentional defense-in-depth and idempotent for E.164 input.

- [ ] **Step 4: Remove `isValidCaPhone`**

In `users-contact.ts`, delete `isValidCaPhone`. Keep `normalizeEmail`/`isValidEmail` only if other callers remain (check `rg -n "isValidEmail|normalizeEmail|isValidCaPhone" apps/web`); otherwise delete the file and remove its imports.

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/web && pnpm exec vitest run "app/(marketing)/contact/__tests__/actions.test.ts" && pnpm exec tsc --noEmit`
Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(marketing\)/contact apps/web/lib/services/users-contact.ts
git commit -m "refactor(contact): route phone/email through commons schema; drop isValidCaPhone"
```

---

## Phase 4 — Form migrations (follow `login-form.tsx` pattern)

> Each form: `useForm({ resolver: zodResolver(schema), defaultValues })`, shadcn `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage`, submit via `form.handleSubmit(onSubmit)`, server errors surfaced with `form.setError("root", …)` or a local error state (as login does). Phone fields render `<PhoneInput {...field} defaultCountry={defaultCountry} />` inside a `FormField`. `defaultCountry` is passed in as a prop computed server-side.

### Task 11: Plumb `defaultCountry` from settings into the forms' parents

**Files:**
- Modify: each server component that renders an in-scope form: contact page, account page, the inquiries list/new-inquiry parent, the order page, the checkout page.

**Interfaces:**
- Consumes: `getAppSettings()` (returns `{ timezone, cutoffHour }`), `tzToDefaultCountry`.
- Produces: a `defaultCountry: CountryCode` prop passed to each form component.

- [ ] **Step 1: Find the parents**

Run: `cd apps/web && rg -ln "ContactForm|AccountForm|AddInquirySheet|OrderForm|<Checkout" app`

- [ ] **Step 2: In each parent (server component), compute and pass the prop**

```tsx
import { getAppSettings } from "@/lib/services/app-settings.service";
import { tzToDefaultCountry } from "@tiffin/commons";

// in the async server component body:
const { timezone } = await getAppSettings();
const defaultCountry = tzToDefaultCountry(timezone);
// pass to the form: <ContactForm defaultCountry={defaultCountry} />
```

For the public marketing/checkout pages (also server components by default), the same call works — `getAppSettings` runs server-side.

- [ ] **Step 3: Typecheck (will fail until forms accept the prop — that's expected; proceed to per-form tasks)**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: errors only about forms not yet accepting `defaultCountry`. Do NOT commit yet — commit each form together with its parent wiring in its task below.

---

### Task 12: Migrate `contact-form.tsx`

**Files:**
- Modify: `apps/web/app/(marketing)/contact/contact-form.tsx`
- Create: `apps/web/app/(marketing)/contact/schema.ts`

**Interfaces:**
- Consumes: `phoneSchema`, `emailSchema`, `PhoneInput`, RHF, `createWebsiteInquiry`.
- Produces: `ContactForm({ defaultCountry }: { defaultCountry: CountryCode })`.

- [ ] **Step 1: Create the form schema**

Create `contact/schema.ts`:

```ts
import { z } from "zod";

export function contactFormSchema() {
  return z.object({
    fullName: z.string().trim().min(1, "Name is required"),
    phone: z.string().min(1, "Phone is required"),
    email: z.string().optional(),
    postalCode: z.string().optional(),
    message: z.string().optional(),
    company: z.string().optional(), // honeypot
  });
}
export type ContactFormValues = z.infer<ReturnType<typeof contactFormSchema>>;
```

(Phone is validated to E.164 on the **server** action and `inquiriesService`; the client schema only requires non-empty so the country picker UX stays smooth. The `PhoneInput` itself blocks structurally invalid numbers.)

- [ ] **Step 2: Rewrite the component using the login-form pattern**

Replace `contact-form.tsx` body with RHF. Key parts:

```tsx
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import type { CountryCode } from "libphonenumber-js";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { contactFormSchema, type ContactFormValues } from "./schema";
import { createWebsiteInquiry } from "./actions";

export function ContactForm({ defaultCountry }: { defaultCountry: CountryCode }) {
  const [done, setDone] = useState<null | { waitlisted: boolean }>(null);
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema()),
    defaultValues: { fullName: "", phone: "", email: "", postalCode: "", message: "", company: "" },
  });

  async function onSubmit(values: ContactFormValues) {
    try {
      const res = await createWebsiteInquiry(values);
      setDone({ waitlisted: res.waitlisted });
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Something went wrong" });
    }
  }

  if (done) { /* keep the existing success card markup */ }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-lg gap-3">
        <FormField control={form.control} name="fullName" render={({ field }) => (
          <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>Phone</FormLabel>
            <FormControl><PhoneInput {...field} defaultCountry={defaultCountry} /></FormControl>
            <FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem><FormLabel>Email <span className="text-muted-foreground">(optional)</span></FormLabel>
            <FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
        )} />
        {/* postalCode + message fields: same FormField shape; keep textarea for message */}
        {/* honeypot: keep the hidden input, bound via form.register("company") */}
        {form.formState.errors.root && <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>}
        <Button type="submit" disabled={form.formState.isSubmitting} className="hover-lift group w-fit">
          Send message<Send className="icon-pop size-4" />
        </Button>
      </form>
    </Form>
  );
}
```

Preserve the success-card markup and the honeypot field (register it with `{...form.register("company")}` on the existing hidden input).

- [ ] **Step 3: Wire the parent** — pass `defaultCountry` (done in Task 11 for the contact page).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS for contact (other unmigrated forms may still error — acceptable mid-phase).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(marketing\)/contact
git commit -m "feat(contact): migrate contact form to react-hook-form + PhoneInput"
```

---

### Task 13: Migrate `account-form.tsx`

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/account/account-form.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/account/schema.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/account/page.tsx` (pass `defaultCountry`)

**Interfaces:**
- Produces: `AccountForm({ phone, email, defaultCountry })`.

- [ ] **Step 1: Schema**

Create `account/schema.ts`:

```ts
import { z } from "zod";
export const accountFormSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
});
export type AccountFormValues = z.infer<typeof accountFormSchema>;
```

- [ ] **Step 2: Rewrite** the component with `useForm` (defaultValues `{ phone, email }`), a `phone` `FormField` rendering `<PhoneInput defaultCountry={defaultCountry} {...field} />`, an `email` `FormField` with `<Input type="email" />`, submit → `updateMyContact(values)`, keep the "Saved." success line via local state set in `onSubmit`. Surface server errors via `form.setError("root", …)`.

- [ ] **Step 3: Parent** — in `account/page.tsx` compute `defaultCountry` (Task 11 pattern) and pass it.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS for account.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/account"
git commit -m "feat(account): migrate contact form to react-hook-form + PhoneInput"
```

---

### Task 14: Migrate `new-inquiry-form.tsx` (`AddInquirySheet`)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/inquiries/inquiry-schema.ts`
- Modify: the parent that renders `AddInquirySheet` (pass `defaultCountry`)

**Interfaces:**
- Produces: `AddInquirySheet({ trigger, defaultCountry })`.

- [ ] **Step 1: Schema** — `inquiry-schema.ts`:

```ts
import { z } from "zod";
export const inquiryFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
  source: z.string().min(1),
  notes: z.string().optional(),
});
export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
```

- [ ] **Step 2: Rewrite** the sheet's body with `useForm`. Keep the `Sheet`/`SheetTrigger`/`SheetContent` shell and the `open` state. Replace the field block: `fullName` (Input), `phone` (PhoneInput), `email` (Input), `source` (shadcn `Select` driven via `<FormField>` + `field.value`/`field.onChange`), `notes` (textarea via `form.register`). On submit success: `form.reset()`, `setOpen(false)`, `router.refresh()`. Errors via `form.setError("root", …)`.

- [ ] **Step 3: Parent** — pass `defaultCountry` to `AddInquirySheet`.

- [ ] **Step 4: Typecheck + commit**

Run: `cd apps/web && pnpm exec tsc --noEmit`

```bash
git add "apps/web/app/(dashboard)/dashboard/inquiries"
git commit -m "feat(inquiries): migrate new-inquiry form to react-hook-form + PhoneInput"
```

---

### Task 15: Migrate `order-form.tsx` (email field only; phone is read-only)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx`

**Interfaces:**
- Produces: unchanged props; the editable `email` field validated via RHF.

> The order form's phone comes from the inquiry and is **not** editable here, so no `PhoneInput`. The migration scope is: move the editable contact field (`email`) and the address fields into RHF, keeping the pricing-preview `useEffect` working. Because this form has heavy non-RHF interactive state (selects, checkboxes, live pricing), a full RHF rewrite is higher-risk and lower-value.

- [ ] **Step 1: Minimal, safe change** — wrap only the `email` input with a small `useForm` for `{ email }` + `emailFormSchema = z.object({ email: z.string().optional() })`, OR (preferred for consistency) keep the existing `useState` form but validate `email` on submit with `emailSchema.safeParse` from commons and show an inline error. Pick the second (lower risk): on `submit`, if `email && !emailSchema.safeParse(email).success`, `setError("Enter a valid email")` and return.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx"
git commit -m "feat(order): validate email via commons schema on convert"
```

---

### Task 16: Migrate `checkout.tsx` contact step

**Files:**
- Modify: `apps/web/components/checkout/checkout.tsx`
- Modify: the checkout page (pass `defaultCountry`)
- Create: `apps/web/components/checkout/contact-schema.ts`

**Interfaces:**
- Produces: `Checkout({ defaultCountry })`; step-1 contact fields validated via RHF.

> Checkout is a 2-step wizard with sessionStorage seeding and a postal-zone check. Scope: convert the **step-1 contact block** to RHF (fullName, phone, email, addressLine, city, postalCode). Keep the `step`/`zone`/`selections` machinery as-is. The phone field uses `PhoneInput`. "Continue to payment" calls `form.trigger()` and only advances when valid.

- [ ] **Step 1: Schema** — `contact-schema.ts`:

```ts
import { z } from "zod";
export const checkoutContactSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
  addressLine: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().min(1, "City is required"),
  postalCode: z.string().trim().min(1, "Postal code is required"),
});
export type CheckoutContactValues = z.infer<typeof checkoutContactSchema>;
```

- [ ] **Step 2: Rewrite step-1** to use `useForm<CheckoutContactValues>` for the contact fields; the postal `Check` button reads `form.getValues("postalCode")`. "Continue to payment" → `const ok = await form.trigger(); if (ok) setStep(2);`. `confirm()` reads `form.getValues()` for the `contact` payload to `confirmSubscription`. Phone via `<PhoneInput defaultCountry={defaultCountry} {...field} />`.

- [ ] **Step 3: Parent** — pass `defaultCountry` to `<Checkout>`.

- [ ] **Step 4: Typecheck + commit**

Run: `cd apps/web && pnpm exec tsc --noEmit`

```bash
git add apps/web/components/checkout "apps/web/app/(public)/checkout"
git commit -m "feat(checkout): migrate contact step to react-hook-form + PhoneInput"
```

---

### Task 17: Migrate `settings/general/settings-form.tsx` (no phone; RHF consistency)

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/settings/general/settings-form.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/settings/general/schema.ts`

**Interfaces:**
- Produces: `SettingsForm({ timezone, cutoffHour })` backed by RHF.

- [ ] **Step 1: Schema**

```ts
import { z } from "zod";
export const settingsFormSchema = z.object({
  timezone: z.string().min(1, "Timezone is required"),
  cutoffHour: z.coerce.number().int().min(0, "0–23").max(23, "0–23"),
});
export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
```

- [ ] **Step 2: Rewrite** with `useForm` (defaultValues `{ timezone, cutoffHour }`), `timezone` via `FormField` + shadcn `Select` (the existing `ZONES` list), `cutoffHour` via `FormField` + numeric `Input`. Submit → `saveAppSettings(values)` then `router.refresh()`. This removes the manual `parseInt`/range check (now in the schema).

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/web && pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: full suite PASS, exit 0.

```bash
git add "apps/web/app/(dashboard)/dashboard/settings/general"
git commit -m "feat(settings): migrate general settings form to react-hook-form"
```

---

## Phase 5 — Final verification

### Task 18: Full suite + typecheck + manual smoke

- [ ] **Step 1: Run everything**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm test`
Then: `cd packages/commons && pnpm test`
Expected: all green; web suite ≥ 145 tests (plus the new cases).

- [ ] **Step 2: Manual smoke (dev server)**

Start the app; on the contact page confirm the phone field shows a country picker defaulting to the country implied by the current `app-settings.timezone` (CA for `America/*`, IN for `Asia/Kolkata`). Submit an invalid phone → inline error; valid national number → inquiry created (verify the stored value is E.164).

- [ ] **Step 3: Commit any smoke fixes; open PR.**

---

## Deferred (recommend a separate plan): admin-editor RHF migration

`catalog/[resource]/resource-editor.tsx` (150 LOC), `dishes/dishes-editor.tsx` (179 LOC), and `menus/menu-builder.tsx` (202 LOC) carry **no phone/email** — migrating them to RHF is consistency-only and independent of this feature's validation goal. They are typed-control editors (see the "admin typed controls" convention). Recommend landing Phases 1–5 first, then a follow-up plan `2026-..-admin-editors-rhf.md` that converts each editor following the same `login-form` pattern. (Surfaced to the user at plan handoff.)

---

## Self-Review

- **Spec coverage:** commons layer (Tasks 1–5), phone component (Task 6), backend enforcement on all three write paths + contact action (Tasks 7–10), country default flow (Task 11), data-form migrations contact/account/new-inquiry/order/checkout/settings (Tasks 12–17), E.164 storage (Tasks 3,7,8,9), testing (each task + Task 18). Admin editors explicitly deferred with rationale (spec's "all forms" honored as a sequenced follow-up; flagged to user).
- **Placeholder scan:** none — concrete code or a precise, bounded edit in every step. Tasks 9/15 intentionally name the lower-risk option explicitly.
- **Type consistency:** `phoneSchema()` is always called as a factory; `emailSchema` is a value; `tzToDefaultCountry` returns `CountryCode`; `defaultCountry: CountryCode` prop name consistent across forms; `PhoneInput` `value`/`onChange` match RHF `field`.
