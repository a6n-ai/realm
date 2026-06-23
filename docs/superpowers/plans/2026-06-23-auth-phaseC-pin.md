# Phase C — PIN Re-unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4-digit PIN that re-unlocks an already-authenticated session (idle-timeout or manual lock), with password-gated PIN management and a force-password fallback after repeated failures.

**Architecture:** PIN hash + attempt counter live on `users`. A `UsersService` subclass owns `setPin`/`removePin`/`verifyPin` through the audited `super.update` seam (PIN columns stay out of the writable allowlist). Lock state is an httpOnly `tg_locked` cookie; the **dashboard layout** (not middleware — none exists) redirects to `/lock` when locked. Idle is detected by a client `<IdleLock>` timer (Next forbids cookie writes during server render); a manual Lock button shares the same path. `/lock` verifies the PIN; 5 failures sign the user out to `/login`.

**Tech Stack:** Next.js (App Router, server components + server actions), Better Auth, Drizzle (pg), bcryptjs, react-hook-form + zod, shadcn/ui, vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-23-auth-phaseC-pin-design.md`. Parent: `docs/superpowers/specs/2026-06-22-crm-auth-profile-design.md` §Phase C.
- **No middleware.** Guards/lock enforced at the dashboard layout/page level via `getSession`.
- **PIN is not a Better Auth credential** — never a cold-login path; `/lock` always requires an existing valid session.
- **PIN columns stay out of `pickUserWritable`** — only the dedicated service methods touch `pinHash`/`pinAttempts`, via `super.update`.
- **Re-auth:** set/change/remove PIN all require the current account password, verified server-side against the `account` table (`providerId="credential"`, bcrypt).
- **Lockout:** 5 wrong PINs → reset `pinAttempts` + sign out → `/login`. No timed-lock column.
- **Trivial-PIN rejection:** reject 4-of-a-kind and straight ascending/descending runs.
- **No secrets logged or returned.** bcrypt only (reuse `@/lib/auth/password`). `session.user.id` is the public id (`usr_…`); the internal bigint never leaves the server. `pinHash` never crosses to a client component — pass a `hasPin: boolean` only.
- **No Claude co-author in commits.** Plain commit messages.
- Conventions: TypeScript; `rg`/`fd` in shell; no unnecessary comments.

---

### Task 1: Schema — `pinHash` + `pinAttempts` on `users`

**Files:**
- Modify: `apps/web/db/schema/auth.ts` (users table)
- Create (generated): `apps/web/db/migrations/0011_*.sql` (+ `meta/` updates) via drizzle-kit

**Interfaces:**
- Produces: `users.pinHash` (`text("pin_hash")`, nullable), `users.pinAttempts` (`integer("pin_attempts")` NOT NULL default 0) — consumed by Task 3.

- [ ] **Step 1: Add the columns to the schema**

In `apps/web/db/schema/auth.ts`, add `integer` to the drizzle imports:

```ts
import { bigint, boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
```

Add the two columns inside the `users` table object, after `role`:

```ts
    role: userRole("role").notNull().default("user"),
    pinHash: text("pin_hash"),
    pinAttempts: integer("pin_attempts").notNull().default(0),
    bauthCreatedAt: timestamp("bauth_created_at").notNull().defaultNow(),
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter web db:generate`
Expected: a new `apps/web/db/migrations/0011_<name>.sql` containing `ALTER TABLE "users" ADD COLUMN "pin_hash" text;` and `ADD COLUMN "pin_attempts" integer DEFAULT 0 NOT NULL;`, plus an updated `meta/_journal.json`.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter web typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/db/schema/auth.ts apps/web/db/migrations
git commit -m "feat(pin): add pin_hash + pin_attempts columns to users"
```

---

### Task 2: `pinSchema` in `@tiffin/commons`

**Files:**
- Create: `packages/commons/src/util/pin.ts`
- Modify: `packages/commons/src/index.ts` (add export)
- Test: `packages/commons/src/util/__tests__/pin.test.ts`

**Interfaces:**
- Produces: `pinSchema` — a `z.ZodType<string>` accepting exactly 4 digits, rejecting trivial PINs. Consumed by Tasks 3 and 6.

- [ ] **Step 1: Write the failing test**

Create `packages/commons/src/util/__tests__/pin.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pinSchema } from "../pin";

describe("pinSchema", () => {
  it("accepts non-trivial 4-digit PINs", () => {
    for (const ok of ["1357", "2580", "8024", "1029"]) {
      expect(pinSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects non-4-digit or non-numeric input", () => {
    for (const bad of ["123", "12345", "12a4", "", "1.34"]) {
      expect(pinSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects four-of-a-kind", () => {
    for (const bad of ["0000", "1111", "9999"]) {
      expect(pinSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects straight ascending/descending runs", () => {
    for (const bad of ["0123", "1234", "6789", "4321", "9876", "3210"]) {
      expect(pinSchema.safeParse(bad).success).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter @tiffin/commons exec vitest run src/util/__tests__/pin.test.ts`
Expected: FAIL — cannot find module `../pin`.

- [ ] **Step 3: Implement `pinSchema`**

Create `packages/commons/src/util/pin.ts`:

```ts
import { z } from "zod";

// A straight run (ascending or descending) of any 4 consecutive digits is a
// substring of these; four-of-a-kind is caught by the backreference. Everything
// else is allowed — this is a convenience PIN, not a password.
export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits")
  .refine(
    (p) =>
      !/^(\d)\1{3}$/.test(p) &&
      !"0123456789".includes(p) &&
      !"9876543210".includes(p),
    "Avoid an easily guessed PIN like 1234, 0000, or 4321",
  );
```

- [ ] **Step 4: Export it**

In `packages/commons/src/index.ts`, after the password export line (`export * from "./util/password";`), add:

```ts
export * from "./util/pin";
```

- [ ] **Step 5: Run it (GREEN)**

Run: `pnpm --filter @tiffin/commons exec vitest run src/util/__tests__/pin.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/commons/src/util/pin.ts packages/commons/src/index.ts packages/commons/src/util/__tests__/pin.test.ts
git commit -m "feat(pin): add pinSchema (4 digits, reject trivial) to commons"
```

---

### Task 3: `UsersService` — `setPin` / `removePin` / `verifyPin` / `hasPin`

**Files:**
- Modify: `apps/web/lib/services/users.service.ts`
- Test: `apps/web/lib/services/__tests__/users-pin.test.ts`

**Interfaces:**
- Consumes: `pinSchema` (Task 2); `users.pinHash`/`users.pinAttempts` (Task 1); `account` table (`@/db/schema`); `verifyPassword`, `hashPassword` (`@/lib/auth/password`).
- Produces on `usersService`:
  - `setPin(userId: string, currentPassword: string, newPin: string): Promise<void>` — `userId` is the public id (`usr_…`).
  - `removePin(userId: string, currentPassword: string): Promise<void>`
  - `verifyPin(userId: string, pin: string): Promise<{ ok: boolean; forcePassword?: boolean }>`
  - `hasPin(userId: string): Promise<boolean>`
  - All throw `ValidationError` on bad input/password (used by Tasks 4 and 6).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/services/__tests__/users-pin.test.ts` (mirrors the DB setup of the sibling `users-profile.test.ts`):

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { account, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { usersService } from "@/lib/services/users.service";

const PHONE = "+15550000333";
const PASSWORD = "correct-horse";

async function seedUser() {
  const [u] = await db
    .insert(users)
    .values({ name: "Pin Tester", phone: PHONE, role: "user" })
    .returning({ id: users.id, publicId: users.publicId });
  await db.insert(account).values({
    accountId: String(u.id),
    providerId: "credential",
    userId: u.id,
    password: await hashPassword(PASSWORD),
  });
  return u;
}

async function cleanup() {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.phone, PHONE));
  for (const r of rows) {
    await db.delete(account).where(eq(account.userId, r.id));
    await db.delete(users).where(eq(users.id, r.id));
  }
}

describe("UsersService PIN methods", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  it("setPin rejects a wrong password and writes nothing", async () => {
    const u = await seedUser();
    await expect(usersService.setPin(u.publicId, "wrong", "1357")).rejects.toThrow();
    expect(await usersService.hasPin(u.publicId)).toBe(false);
  });

  it("setPin with the right password sets the PIN; verifyPin confirms it", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    expect(await usersService.hasPin(u.publicId)).toBe(true);
    expect(await usersService.verifyPin(u.publicId, "1357")).toEqual({ ok: true });
    expect(await usersService.verifyPin(u.publicId, "2468")).toEqual({ ok: false });
  });

  it("forces password after 5 wrong PINs and resets the counter", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    for (let i = 0; i < 4; i++) {
      expect(await usersService.verifyPin(u.publicId, "0000")).toEqual({ ok: false });
    }
    expect(await usersService.verifyPin(u.publicId, "0000")).toEqual({ ok: false, forcePassword: true });
    const [row] = await db.select({ a: users.pinAttempts }).from(users).where(eq(users.publicId, u.publicId));
    expect(row.a).toBe(0);
  });

  it("removePin clears the PIN after a correct password", async () => {
    const u = await seedUser();
    await usersService.setPin(u.publicId, PASSWORD, "1357");
    await expect(usersService.removePin(u.publicId, "wrong")).rejects.toThrow();
    await usersService.removePin(u.publicId, PASSWORD);
    expect(await usersService.hasPin(u.publicId)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/users-pin.test.ts`
Expected: FAIL — `usersService.setPin is not a function`.

- [ ] **Step 3: Implement the methods**

In `apps/web/lib/services/users.service.ts`, extend the imports:

```ts
import { Role, ValidationError, phoneSchema, emailSchema, pinSchema } from "@tiffin/commons";
import { account, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
```

(The existing import is `import { users } from "@/db/schema";` — replace it with the `account, users` form above.)

Add these methods inside the `UsersService` class, after `updateProfile`:

```ts
  async setPin(userId: string, currentPassword: string, newPin: string) {
    const parsed = pinSchema.safeParse(newPin);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid PIN");
    await this.assertPassword(userId, currentPassword);
    return super.update(userId, { pinHash: await hashPassword(parsed.data), pinAttempts: 0 });
  }

  async removePin(userId: string, currentPassword: string) {
    await this.assertPassword(userId, currentPassword);
    return super.update(userId, { pinHash: null, pinAttempts: 0 });
  }

  async verifyPin(userId: string, pin: string): Promise<{ ok: boolean; forcePassword?: boolean }> {
    const [u] = await db
      .select({ pinHash: users.pinHash, pinAttempts: users.pinAttempts })
      .from(users)
      .where(eq(users.publicId, userId))
      .limit(1);
    if (!u?.pinHash) return { ok: false };
    if (await verifyPassword(pin, u.pinHash)) {
      await super.update(userId, { pinAttempts: 0 });
      return { ok: true };
    }
    const attempts = (u.pinAttempts ?? 0) + 1;
    if (attempts >= 5) {
      await super.update(userId, { pinAttempts: 0 });
      return { ok: false, forcePassword: true };
    }
    await super.update(userId, { pinAttempts: attempts });
    return { ok: false };
  }

  async hasPin(userId: string): Promise<boolean> {
    const [u] = await db
      .select({ pinHash: users.pinHash })
      .from(users)
      .where(eq(users.publicId, userId))
      .limit(1);
    return Boolean(u?.pinHash);
  }

  private async assertPassword(userId: string, currentPassword: string): Promise<void> {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, userId)).limit(1);
    if (!u) throw new ValidationError("User not found");
    const [acct] = await db
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")))
      .limit(1);
    if (!acct?.password || !(await verifyPassword(currentPassword, acct.password))) {
      throw new ValidationError("Password is incorrect");
    }
  }
```

- [ ] **Step 4: Run it (GREEN)**

Run: `pnpm --filter web exec vitest run lib/services/__tests__/users-pin.test.ts`
Expected: PASS (4 tests). If the suite cannot reach a database, note it and run the rest of the gate — these are DB tests like the existing `users-profile.test.ts`.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter web typecheck` → 0 errors.

```bash
git add apps/web/lib/services/users.service.ts apps/web/lib/services/__tests__/users-pin.test.ts
git commit -m "feat(pin): UsersService setPin/removePin/verifyPin/hasPin (password-gated, audited)"
```

---

### Task 4: Lock state + `/lock` route + dashboard-layout enforcement

**Files:**
- Create: `apps/web/lib/auth/lock.ts` (cookie helpers)
- Create: `apps/web/lib/auth/lock-actions.ts` (`lockSession` server action)
- Create: `apps/web/app/(auth)/lock/page.tsx`
- Create: `apps/web/app/(auth)/lock/lock-form.tsx`
- Create: `apps/web/app/(auth)/lock/actions.ts` (`verifyPinAction`)
- Modify: `apps/web/app/(dashboard)/dashboard/layout.tsx`

**Interfaces:**
- Consumes: `usersService.verifyPin`, `usersService.hasPin` (Task 3); `getSession` (`@/lib/auth/session`); `auth` (`@/lib/auth`).
- Produces:
  - `lib/auth/lock.ts`: `LOCK_COOKIE = "tg_locked"`, `isLocked(): Promise<boolean>`, `setLock(): Promise<void>`, `clearLock(): Promise<void>`. (`setLock`/`clearLock` write cookies → only valid inside a server action or route handler; `isLocked` reads → fine in render.)
  - `lib/auth/lock-actions.ts`: `lockSession(): Promise<void>` (`"use server"`).
  - `app/(auth)/lock/actions.ts`: `verifyPinAction(pin: string): Promise<{ ok: boolean; forcePassword?: boolean }>` (`"use server"`).

- [ ] **Step 1: Lock cookie helpers**

Create `apps/web/lib/auth/lock.ts`:

```ts
import { cookies } from "next/headers";

export const LOCK_COOKIE = "tg_locked";

export async function isLocked(): Promise<boolean> {
  return (await cookies()).get(LOCK_COOKIE)?.value === "1";
}

export async function setLock(): Promise<void> {
  (await cookies()).set(LOCK_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function clearLock(): Promise<void> {
  (await cookies()).delete(LOCK_COOKIE);
}
```

- [ ] **Step 2: `lockSession` server action**

Create `apps/web/lib/auth/lock-actions.ts`:

```ts
"use server";

import { setLock } from "./lock";

export async function lockSession(): Promise<void> {
  await setLock();
}
```

- [ ] **Step 3: `verifyPinAction` server action**

Create `apps/web/app/(auth)/lock/actions.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import { clearLock } from "@/lib/auth/lock";
import { usersService } from "@/lib/services/users.service";

export async function verifyPinAction(pin: string): Promise<{ ok: boolean; forcePassword?: boolean }> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, forcePassword: true };
  const res = await usersService.verifyPin(session.user.id, pin);
  if (res.ok) {
    await clearLock();
    return { ok: true };
  }
  if (res.forcePassword) {
    await clearLock();
    await auth.api.signOut({ headers: await headers() });
    return { ok: false, forcePassword: true };
  }
  return { ok: false };
}
```

- [ ] **Step 4: `/lock` page (server guard)**

Create `apps/web/app/(auth)/lock/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { LockIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { LockForm } from "./lock-form";

export default async function LockPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-md">
          <LockIcon className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Session locked</h1>
        <p className="text-muted-foreground text-sm">Enter your PIN to continue.</p>
      </div>
      <LockForm />
    </div>
  );
}
```

- [ ] **Step 5: `/lock` client form**

Create `apps/web/app/(auth)/lock/lock-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyPinAction } from "./actions";

export function LockForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await verifyPinAction(pin);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    if (res.forcePassword) {
      router.push("/login");
      return;
    }
    setError("Incorrect PIN. Try again.");
    setPin("");
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        autoFocus
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        className="text-center text-2xl tracking-[0.5em]"
        aria-label="PIN"
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={pending || pin.length !== 4}>
        Unlock
      </Button>
      <button
        type="button"
        className="text-muted-foreground text-sm underline"
        onClick={() => signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}
      >
        Sign in with password instead
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Enforce the lock in the dashboard layout**

In `apps/web/app/(dashboard)/dashboard/layout.tsx`, add imports:

```ts
import { isLocked } from "@/lib/auth/lock";
import { usersService } from "@/lib/services/users.service";
import { IdleLock } from "@/components/dashboard/idle-lock";
```

Replace the guard block and the `<AppSidebar … />` line / children render. The new body of `DashboardLayout`:

```tsx
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const hasPin = await usersService.hasPin(session.user.id);
  if (hasPin && (await isLocked())) redirect("/lock");

  return (
    <SidebarProvider>
      <AppSidebar user={{ email: session.user.email ?? "", role: session.user.role }} hasPin={hasPin} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium">Dashboard</span>
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
        <div className="flex-1 p-6">{children}</div>
      </SidebarInset>
      {hasPin && <IdleLock />}
    </SidebarProvider>
  );
```

(`IdleLock` and the `AppSidebar` `hasPin` prop are implemented in Task 5 — typecheck is expected to fail until then. Do not run the gate at this task's end; commit and proceed.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/auth/lock.ts apps/web/lib/auth/lock-actions.ts "apps/web/app/(auth)/lock" "apps/web/app/(dashboard)/dashboard/layout.tsx"
git commit -m "feat(pin): tg_locked cookie, /lock route + verifyPinAction, layout redirect when locked"
```

---

### Task 5: `<IdleLock>` timer + manual Lock button in the sidebar

**Files:**
- Create: `apps/web/components/dashboard/idle-lock.tsx`
- Modify: `apps/web/components/dashboard/app-sidebar.tsx`
- Test: `apps/web/components/dashboard/__tests__/idle-lock.test.tsx`

**Interfaces:**
- Consumes: `lockSession` (Task 4, `@/lib/auth/lock-actions`).
- Produces: `<IdleLock thresholdMs?>` (default 15 min) — consumed by the layout (Task 4); `AppSidebar` now takes `hasPin: boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/dashboard/__tests__/idle-lock.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const lockSession = vi.fn().mockResolvedValue(undefined);
const push = vi.fn();
vi.mock("@/lib/auth/lock-actions", () => ({ lockSession }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { IdleLock } from "../idle-lock";

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); lockSession.mockClear(); });

describe("IdleLock", () => {
  it("locks the session after the idle threshold elapses", async () => {
    vi.useFakeTimers();
    render(<IdleLock thresholdMs={1000} />);
    expect(lockSession).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1001);
    expect(lockSession).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter web exec vitest run components/dashboard/__tests__/idle-lock.test.tsx`
Expected: FAIL — cannot find module `../idle-lock`.

- [ ] **Step 3: Implement `<IdleLock>`**

Create `apps/web/components/dashboard/idle-lock.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { lockSession } from "@/lib/auth/lock-actions";

const IDLE_MS = 15 * 60 * 1000;
const ACTIVITY = ["mousemove", "keydown", "pointerdown", "scroll", "visibilitychange"];

export function IdleLock({ thresholdMs = IDLE_MS }: { thresholdMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        await lockSession();
        router.push("/lock");
      }, thresholdMs);
    };
    for (const e of ACTIVITY) window.addEventListener(e, reset, { passive: true });
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const e of ACTIVITY) window.removeEventListener(e, reset);
    };
  }, [thresholdMs, router]);

  return null;
}
```

- [ ] **Step 4: Run it (GREEN)**

Run: `pnpm --filter web exec vitest run components/dashboard/__tests__/idle-lock.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Add the Lock button to the sidebar**

In `apps/web/components/dashboard/app-sidebar.tsx`:

Add `LockIcon` to the `lucide-react` import and import the lock action:

```ts
import { lockSession } from "@/lib/auth/lock-actions";
```

Change the component signature to accept `hasPin`:

```ts
export function AppSidebar({ user, hasPin }: { user: { email: string; role: string }; hasPin: boolean }) {
```

In the footer dropdown, add a Lock item before the Sign-out item (inside the existing `<DropdownMenuGroup>`), shown only when a PIN exists:

```tsx
                <DropdownMenuGroup>
                  {hasPin && (
                    <DropdownMenuItem
                      onClick={async () => {
                        await lockSession();
                        router.push("/lock");
                      }}
                    >
                      <LockIcon data-icon="inline-start" />
                      Lock
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => signOut({ fetchOptions: { onSuccess: () => { router.push("/login"); } } })}>
                    <LogOutIcon data-icon="inline-start" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck` → 0 errors (the layout from Task 4 now resolves).

```bash
git add apps/web/components/dashboard/idle-lock.tsx apps/web/components/dashboard/app-sidebar.tsx apps/web/components/dashboard/__tests__/idle-lock.test.tsx
git commit -m "feat(pin): IdleLock idle-timeout + manual Lock button (shown when PIN set)"
```

---

### Task 6: Security tab `PinSection` + account actions

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/account/pin-section.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/account/actions.ts`
- Modify: `apps/web/app/(dashboard)/dashboard/account/account-tabs.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/account/page.tsx`
- Test: `apps/web/app/(dashboard)/dashboard/account/__tests__/pin-section.test.tsx`

**Interfaces:**
- Consumes: `pinSchema` (Task 2); `usersService.setPin`/`removePin` (Task 3).
- Produces: server actions `setMyPin(currentPassword, newPin)`, `removeMyPin(currentPassword)` returning `{ ok: boolean; message?: string }`; `<PinSection hasPin />`; `AccountTabs` now takes `hasPin`.

- [ ] **Step 1: Write the failing render test**

Create `apps/web/app/(dashboard)/dashboard/account/__tests__/pin-section.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinSection } from "../pin-section";

vi.mock("../actions", () => ({ setMyPin: vi.fn(), removeMyPin: vi.fn() }));

describe("PinSection", () => {
  it("offers to set a PIN when none exists", () => {
    render(<PinSection hasPin={false} />);
    expect(screen.getByRole("button", { name: /set pin/i })).toBeDefined();
  });

  it("offers to update/remove when a PIN exists", () => {
    render(<PinSection hasPin />);
    expect(screen.getByRole("button", { name: /update pin/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /remove pin/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it (RED)**

Run: `pnpm --filter web exec vitest run "app/(dashboard)/dashboard/account/__tests__/pin-section.test.tsx"`
Expected: FAIL — cannot find module `../pin-section`.

- [ ] **Step 3: Add the account server actions**

In `apps/web/app/(dashboard)/dashboard/account/actions.ts`, add `ValidationError` to the commons import and append:

```ts
export async function setMyPin(currentPassword: string, newPin: string): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  try {
    await usersService.setPin(session.user.id, currentPassword, newPin);
    revalidatePath("/dashboard/account");
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function removeMyPin(currentPassword: string): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  try {
    await usersService.removePin(session.user.id, currentPassword);
    revalidatePath("/dashboard/account");
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, message: e.message };
    throw e;
  }
}
```

The import line becomes:

```ts
import { AuthError, ValidationError } from "@tiffin/commons";
```

- [ ] **Step 4: Implement `<PinSection>`**

Create `apps/web/app/(dashboard)/dashboard/account/pin-section.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { pinSchema } from "@tiffin/commons";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { setMyPin, removeMyPin } from "./actions";

const setSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPin: pinSchema,
    confirm: z.string().min(1, "Please confirm your PIN"),
  })
  .refine((d) => d.newPin === d.confirm, { message: "PINs do not match", path: ["confirm"] });

type SetValues = z.infer<typeof setSchema>;
const removeSchema = z.object({ currentPassword: z.string().min(1, "Current password is required") });
type RemoveValues = z.infer<typeof removeSchema>;

export function PinSection({ hasPin }: { hasPin: boolean }) {
  const [showPw, setShowPw] = useState(false);

  const setForm = useForm<SetValues>({
    resolver: zodResolver(setSchema),
    defaultValues: { currentPassword: "", newPin: "", confirm: "" },
  });
  const removeForm = useForm<RemoveValues>({
    resolver: zodResolver(removeSchema),
    defaultValues: { currentPassword: "" },
  });

  async function onSet(values: SetValues) {
    const res = await setMyPin(values.currentPassword, values.newPin);
    if (!res.ok) {
      setForm.setError("root", { message: res.message ?? "Could not set the PIN." });
      return;
    }
    toast.success(hasPin ? "PIN updated." : "PIN set.");
    setForm.reset();
  }

  async function onRemove(values: RemoveValues) {
    const res = await removeMyPin(values.currentPassword);
    if (!res.ok) {
      removeForm.setError("root", { message: res.message ?? "Could not remove the PIN." });
      return;
    }
    toast.success("PIN removed.");
    removeForm.reset();
  }

  const pinInput = (field: { value: string; onChange: (v: string) => void; name: string }) => (
    <Input
      type="password"
      inputMode="numeric"
      maxLength={4}
      autoComplete="off"
      value={field.value}
      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
      name={field.name}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">{hasPin ? "Update PIN" : "Set a PIN"}</h3>
        <p className="text-muted-foreground text-sm">A 4-digit PIN re-unlocks your session without a full sign-in.</p>
      </div>

      <Form {...setForm}>
        <form onSubmit={setForm.handleSubmit(onSet)} className="grid max-w-md gap-3">
          <FormField
            control={setForm.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showPw ? "text" : "password"} {...field} />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                      onClick={() => setShowPw((v) => !v)}
                    >
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={setForm.control}
            name="newPin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New PIN</FormLabel>
                <FormControl>{pinInput(field)}</FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={setForm.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm PIN</FormLabel>
                <FormControl>{pinInput(field)}</FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {setForm.formState.errors.root && (
            <p className="text-destructive text-sm">{setForm.formState.errors.root.message}</p>
          )}
          <Button type="submit" disabled={setForm.formState.isSubmitting} className="w-fit">
            {hasPin ? "Update PIN" : "Set PIN"}
          </Button>
        </form>
      </Form>

      {hasPin && (
        <Form {...removeForm}>
          <form onSubmit={removeForm.handleSubmit(onRemove)} className="grid max-w-md gap-3">
            <FormField
              control={removeForm.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {removeForm.formState.errors.root && (
              <p className="text-destructive text-sm">{removeForm.formState.errors.root.message}</p>
            )}
            <Button type="submit" variant="destructive" disabled={removeForm.formState.isSubmitting} className="w-fit">
              Remove PIN
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire `PinSection` into the Security tab**

In `apps/web/app/(dashboard)/dashboard/account/account-tabs.tsx`:

Import it and extend props:

```ts
import { PinSection } from "./pin-section";
```

Add `hasPin: boolean;` to `AccountTabsProps`, accept `hasPin` in the destructured params, and add `<PinSection>` in the Security `TabsContent` (after `ChangePasswordForm`, before the sign-out block):

```tsx
      <TabsContent value="security" className="mt-4 flex flex-col gap-6">
        <ChangePasswordForm />
        <PinSection hasPin={hasPin} />
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Sign out of your account on this device.</p>
          <SignOutButton />
        </div>
      </TabsContent>
```

- [ ] **Step 6: Pass `hasPin` from the page**

In `apps/web/app/(dashboard)/dashboard/account/page.tsx`, the `user` row already has `pinHash`. Add the prop to the `<AccountTabs>` element:

```tsx
      <AccountTabs
        image={user.image ?? null}
        name={user.name ?? null}
        phone={user.phone ?? ""}
        email={user.email ?? ""}
        emailVerified={user.emailVerified ?? false}
        defaultCountry={defaultCountry}
        hasPin={Boolean(user.pinHash)}
      />
```

- [ ] **Step 7: Run the render test (GREEN)**

Run: `pnpm --filter web exec vitest run "app/(dashboard)/dashboard/account/__tests__/pin-section.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm --filter web typecheck` → 0 errors.

```bash
git add "apps/web/app/(dashboard)/dashboard/account"
git commit -m "feat(pin): Security-tab PinSection (set/update/remove) + account actions"
```

---

### Task 7: Gate + integration

- [ ] **Step 1: Full gate** — run and report:
  - `pnpm --filter web typecheck` → 0 errors.
  - `pnpm --filter web exec vitest run` → all pass. The `db/__tests__/next-id.test.ts` test is a known flake that fails inside the full suite but passes in isolation — if ONLY that fails, re-run it alone (`pnpm --filter web exec vitest run db/__tests__/next-id.test.ts`) and note it. The new `users-pin.test.ts` is DB-dependent like `users-profile.test.ts`.
  - `pnpm --filter @tiffin/commons exec vitest run` → `pin.test.ts` passes.
  - `pnpm --filter web lint` → no NEW issues vs the pre-Phase-C baseline (there are pre-existing errors in `new-inquiry-form.tsx`, `contact/page.tsx`, `theme-provider.tsx` — those are not ours).
  - `pnpm --filter web build` → succeeds; `/dashboard/*` stays dynamic; `/lock` builds.

- [ ] **Step 2: Manual runbook (document; DB + dev server dependent)** — signed in:
  - Security tab → set a PIN (with correct password) → success; wrong password → error, no change.
  - Sidebar → **Lock** → `/lock`; enter correct PIN → back to dashboard; enter wrong PIN 5× → redirected to `/login` (signed out).
  - Idle 15 min (or temporarily lower `IDLE_MS`) → auto-redirect to `/lock`.
  - "Sign in with password instead" on `/lock` → signs out → `/login`.
  - Remove the PIN → Lock button disappears; idle no longer locks; `/lock` no longer reachable via the layout.

- [ ] **Step 3: Commit any straggler fixes**

```bash
git add apps/web packages/commons
git commit -m "chore(pin): phase C integration check; gate green"
```

---

## Self-Review (author)

- **Spec coverage:** schema (T1) ✓; `pinSchema` trivial rejection (T2) ✓; service set/change/remove/verify + password gate + 5-fail force-password (T3) ✓; lock cookie + `/lock` + layout enforcement, no middleware (T4) ✓; idle timer + manual Lock, shown only when PIN set (T5) ✓; Security-tab PinSection (T6) ✓; gate + manual runbook + tests (T7) ✓. `pin_locked_until` intentionally omitted per spec §2.2 decision.
- **Placeholder scan:** none — every code step carries full code.
- **Type consistency:** `verifyPin` returns `{ ok; forcePassword? }` everywhere (T3 def, T4 action, test); `hasPin`/`setPin`/`removePin`/`setMyPin`/`removeMyPin` signatures match across producer and consumer tasks; `AccountTabs`/`AppSidebar`/`PinSection`/`IdleLock` props consistent producer→consumer.
- **Known acceptance:** `verifyPin` writes the attempt counter via the audited `super.update`, so wrong-PIN attempts produce audit rows — acceptable (security-relevant), not noise to suppress.
