# Phase B — Profile + Avatar + Account Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let users manage their profile — upload/crop/remove an avatar, edit their display name, change their password — with the account page reorganized into Profile / Contact / Security tabs.

**Architecture:** A pluggable storage abstraction (`lib/storage`) with a local-disk stub keeps avatar persistence swappable (Vercel Blob / S3 later) without touching forms or actions. Avatar upload is client crop (`react-easy-crop`, bounded output) → server action that validates (type + size + magic bytes) and stores via the driver → `users.image` through the audited `UsersService.updateProfile`. The account page becomes a client `AccountTabs` shell wrapping server-fetched data; password change uses Better Auth's `changePassword`.

**Tech Stack:** Better Auth (client `changePassword`), Next.js 16 App Router server actions, React 19, shadcn (`avatar`, `tabs`, `dialog`, `card`, `badge` — all already present), `react-easy-crop` (new), react-hook-form + zod, vitest (+ jsdom).

## Global Constraints

- **pnpm only.** `pnpm --filter web exec vitest run <path>`, `pnpm --filter web typecheck/lint/build`. Never npm/npx.
- **Internal bigint `users.id` never leaves the server.** Profile mutations resolve the user by `publicId` via `getSession()` + `UsersService`.
- **Avatar storage key is SERVER-generated** (`<publicId>-<random>.<ext>`), never the client filename. No path traversal, no client-controlled overwrite.
- **Avatar validation is server-authoritative**: allowed types jpeg/png/webp, max 2 MB, verified by magic bytes (not just the declared content-type/extension). Client validation is UX-only.
- **No `sharp`** — no server-side re-encode/downscale. The client crop emits a bounded (≤512×512) image; the server validates and stores as-is.
- Storage driver selected by env; default `LocalStorageDriver` → writes under `apps/web/public/uploads/avatars/`, returns a `/uploads/avatars/<key>` URL. `public/uploads/` is gitignored except a `.gitkeep`.
- Profile/name/image writes go through `UsersService` (audited `SessionUpdatableService`), following the `updateContact` seam (`super.update` directly).
- Account page keeps the existing design-system shell (`PageShell`/`PageHeader`); the three sections become shadcn `Tabs`. The existing `AccountForm` (phone/email) + email verify badge + `ResendVerification` move under the **Contact** tab unchanged.
- Commit after every task. No `Co-Authored-By` trailer.

---

### Task 1: Storage abstraction + local driver

**Files:**
- Create: `apps/web/lib/storage/index.ts` (interface + driver selection)
- Create: `apps/web/lib/storage/local.ts` (`LocalStorageDriver`)
- Create: `apps/web/public/uploads/.gitkeep`
- Modify: `apps/web/.gitignore` (ignore `public/uploads/*` except `.gitkeep`) — if no app-level `.gitignore`, add the rule to the repo root `.gitignore`
- Test: `apps/web/lib/storage/__tests__/local.test.ts`

**Interfaces:**
- Produces: `interface StorageDriver { put(key: string, bytes: Uint8Array, contentType: string): Promise<string>; delete(key: string): Promise<void> }`; `storage: StorageDriver` (the selected driver); `LocalStorageDriver`.

- [ ] **Step 1: Write the failing local-driver test**

Create `apps/web/lib/storage/__tests__/local.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { LocalStorageDriver } from "../local";

const root = join(process.cwd(), "public", "uploads", "avatars");
const driver = new LocalStorageDriver();

afterEach(async () => { await rm(join(root, "test-key.png"), { force: true }); });

describe("LocalStorageDriver", () => {
  it("put writes the file and returns a public URL; delete removes it", async () => {
    const url = await driver.put("test-key.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(url).toBe("/uploads/avatars/test-key.png");
    await driver.delete("test-key.png"); // must not throw
    await driver.delete("test-key.png"); // idempotent — missing file is fine
  });
});
```

- [ ] **Step 2: Run it (RED)** — `pnpm --filter web exec vitest run lib/storage/__tests__/local.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the driver + interface**

Create `apps/web/lib/storage/local.ts`:

```ts
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StorageDriver } from "./index";

const DIR = join(process.cwd(), "public", "uploads", "avatars");

export class LocalStorageDriver implements StorageDriver {
  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<string> {
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, key), bytes);
    return `/uploads/avatars/${key}`;
  }
  async delete(key: string): Promise<void> {
    await rm(join(DIR, key), { force: true });
  }
}
```

Create `apps/web/lib/storage/index.ts`:

```ts
import { LocalStorageDriver } from "./local";

export interface StorageDriver {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

// Swap here when a real backend (Vercel Blob / S3) lands — callers never change.
export const storage: StorageDriver = new LocalStorageDriver();
export { LocalStorageDriver };
```

- [ ] **Step 4: Run it (GREEN)** — same command → PASS.

- [ ] **Step 5: gitkeep + ignore + commit**

Create `apps/web/public/uploads/.gitkeep` (empty). Add to the appropriate `.gitignore`:
```
apps/web/public/uploads/*
!apps/web/public/uploads/.gitkeep
```
Run `pnpm --filter web typecheck`.

```bash
git add apps/web/lib/storage apps/web/public/uploads/.gitkeep .gitignore apps/web/.gitignore
git commit -m "feat(storage): pluggable storage abstraction + local-disk driver for avatars"
```

---

### Task 2: `UsersService.updateProfile` (name + image)

**Files:**
- Modify: `apps/web/lib/services/users.service.ts`
- Test: `apps/web/lib/services/__tests__/users-profile.test.ts`

**Interfaces:**
- Produces: `usersService.updateProfile(userId: string, input: { name?: string | null; image?: string | null }): Promise<typeof users.$inferSelect>` — validates name (trim, ≤120 chars; empty → null), passes `image` through (already a server-produced URL or null), writes via `super.update` (audited). Does NOT touch phone/email/role.

- [ ] **Step 1: Write the failing DB-integration test**

Create `apps/web/lib/services/__tests__/users-profile.test.ts` (mirror `inquiries-convert.test.ts`: real `db`, mock `@/lib/auth/session` `getSession`, cleanup `users`). Insert a user, then:
- `updateProfile(publicId, { name: "Aanya" })` → the row's `name` is "Aanya".
- `updateProfile(publicId, { image: "/uploads/avatars/x.png" })` → `image` set; `name` unchanged.
- `updateProfile(publicId, { name: "" })` → `name` becomes null.
- `updateProfile(publicId, { image: null })` → `image` null.
Assert phone/email/role are untouched across these.

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
const { usersService } = await import("@/lib/services/users.service");

async function reset() { await db.delete(users); }

describe("usersService.updateProfile", () => {
  beforeEach(reset);
  afterAll(reset);

  it("updates name and image without touching contact fields", async () => {
    const [u] = await db.insert(users).values({ phone: "+16475550900", role: "user", name: "Old" }).returning();
    await usersService.updateProfile(u.publicId, { name: "Aanya" });
    let [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.name).toBe("Aanya");
    await usersService.updateProfile(u.publicId, { image: "/uploads/avatars/x.png" });
    [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.image).toBe("/uploads/avatars/x.png");
    expect(row.name).toBe("Aanya");
    expect(row.phone).toBe("+16475550900");
    await usersService.updateProfile(u.publicId, { name: "" });
    [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.name).toBeNull();
  });
});
```

- [ ] **Step 2: Run it (RED)** — `pnpm --filter web exec vitest run lib/services/__tests__/users-profile.test.ts` → FAIL (no `updateProfile`).

- [ ] **Step 3: Implement `updateProfile`**

Add to `UsersService` (mirror `updateContact`'s `super.update` seam):

```ts
async updateProfile(userId: string, input: { name?: string | null; image?: string | null }) {
  const patch: { name?: string | null; image?: string | null } = {};
  if (input.name !== undefined) {
    const name = (input.name ?? "").trim();
    if (name.length > 120) throw new ValidationError("Name is too long");
    patch.name = name === "" ? null : name;
  }
  if (input.image !== undefined) patch.image = input.image; // server-produced URL or null
  return super.update(userId, patch);
}
```

- [ ] **Step 4: Run it (GREEN)** — same command → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
git add apps/web/lib/services
git commit -m "feat(users): updateProfile (name + image) via audited service path"
```

---

### Task 3: Avatar server actions (upload + remove)

**Files:**
- Create: `apps/web/app/(dashboard)/dashboard/account/avatar-actions.ts`
- Create: `apps/web/lib/images/validate.ts` (magic-byte sniff + constants)
- Test: `apps/web/lib/images/__tests__/validate.test.ts`

**Interfaces:**
- Produces: `updateMyAvatar(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }>` (reads `formData.get("file")`, validates, stores, updates `users.image`, deletes the prior file). `removeMyAvatar(): Promise<{ ok: true } | { ok: false; error: string }>`. `sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null`; `MAX_AVATAR_BYTES = 2*1024*1024`.

- [ ] **Step 1: Write the failing magic-byte test**

Create `apps/web/lib/images/__tests__/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sniffImageType } from "../validate";

describe("sniffImageType", () => {
  it("detects png / jpeg / webp by magic bytes", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0); webp.set([0x57, 0x45, 0x42, 0x50], 8); // RIFF…WEBP
    expect(sniffImageType(webp)).toBe("image/webp");
  });
  it("rejects non-images (e.g. a script) returning null", () => {
    expect(sniffImageType(new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70]))).toBeNull(); // <?php
  });
});
```

- [ ] **Step 2: Run it (RED)** — `pnpm --filter web exec vitest run lib/images/__tests__/validate.test.ts` → FAIL.

- [ ] **Step 3: Implement the sniffer**

Create `apps/web/lib/images/validate.ts`:

```ts
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function sniffImageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  return null;
}

export function extFor(type: "image/jpeg" | "image/png" | "image/webp"): "jpg" | "png" | "webp" {
  return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
}
```

- [ ] **Step 4: Run it (GREEN)** — same command → PASS.

- [ ] **Step 5: Implement the server actions**

Create `apps/web/app/(dashboard)/dashboard/account/avatar-actions.ts` (`"use server"`):
- `updateMyAvatar(formData)`: `const session = await getSession(); if (!session?.user?.id) return { ok:false, error:"Not signed in" }`. Read `const file = formData.get("file")`; ensure it's a `File`. Read bytes (`new Uint8Array(await file.arrayBuffer())`). If `bytes.length > MAX_AVATAR_BYTES` → `{ ok:false, error:"Image must be 2 MB or smaller" }`. `const type = sniffImageType(bytes); if (!type) return { ok:false, error:"Unsupported image type" }`. Load the current user (`usersService.read(session.user.id)`) to find the old `image`. Generate `const key = \`${session.user.id}-${crypto.randomUUID().slice(0,8)}.${extFor(type)}\``. `const url = await storage.put(key, bytes, type)`. `await usersService.updateProfile(session.user.id, { image: url })`. If the previous `image` was a local `/uploads/avatars/<oldKey>`, `await storage.delete(oldKey)` (best-effort, ignore errors). `revalidatePath("/dashboard/account")`. Return `{ ok:true, url }`.
- `removeMyAvatar()`: resolve session + current user; `await usersService.updateProfile(session.user.id, { image: null })`; delete the old local key best-effort; `revalidatePath`; return `{ ok:true }`.
- Use `crypto.randomUUID()` (Web Crypto, available in the Node runtime). Import `storage` from `@/lib/storage`, `usersService`, `getSession`, `sniffImageType`/`extFor`/`MAX_AVATAR_BYTES`, `revalidatePath` from `next/cache`.

- [ ] **Step 6: Typecheck + commit**

Run `pnpm --filter web typecheck`.

```bash
git add "apps/web/app/(dashboard)/dashboard/account/avatar-actions.ts" apps/web/lib/images
git commit -m "feat(avatar): upload/remove server actions with magic-byte validation + server-generated keys"
```

---

### Task 4: Avatar field component (display + crop + upload + remove)

**Files:**
- Modify: `apps/web/package.json` (add `react-easy-crop`)
- Create: `apps/web/app/(dashboard)/dashboard/account/avatar-field.tsx`
- Create: `apps/web/lib/images/crop.ts` (canvas crop → Blob helper)
- Test: `apps/web/app/(dashboard)/dashboard/account/__tests__/avatar-field.test.tsx`

**Interfaces:**
- Consumes: `updateMyAvatar`/`removeMyAvatar` (Task 3), shadcn `Avatar`/`AvatarImage`/`AvatarFallback`, `Dialog`, `Button`, `react-easy-crop`.
- Props: `AvatarField({ image, name }: { image: string | null; name: string | null })`.

- [ ] **Step 1: Add the crop dependency**

Run: `pnpm --filter web add react-easy-crop`.

- [ ] **Step 2: Write the failing render test**

Create `apps/web/app/(dashboard)/dashboard/account/__tests__/avatar-field.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvatarField } from "../avatar-field";

vi.mock("../avatar-actions", () => ({ updateMyAvatar: vi.fn(), removeMyAvatar: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react-easy-crop", () => ({ default: () => null }));

describe("AvatarField", () => {
  it("shows initials fallback and a change-photo control when no image", () => {
    render(<AvatarField image={null} name="Aanya Roy" />);
    expect(screen.getByText("AR")).toBeDefined();
    expect(screen.getByRole("button", { name: /change|upload|photo/i })).toBeDefined();
  });
});
```

- [ ] **Step 3: Run it (RED)** — `pnpm --filter web exec vitest run "app/(dashboard)/dashboard/account/__tests__/avatar-field.test.tsx"` → FAIL.

- [ ] **Step 4: Implement the crop helper + component**

Create `apps/web/lib/images/crop.ts`: a `getCroppedBlob(imageSrc: string, area: { x; y; width; height }, size = 512): Promise<Blob>` that draws the crop area onto a `size×size` canvas and resolves `canvas.toBlob` as `image/webp` (quality 0.9). Standard react-easy-crop canvas recipe.

Create `avatar-field.tsx` (`"use client"`):
- Compute initials from `name` (first letters of up to 2 words; fallback "U").
- shadcn `Avatar` showing `AvatarImage src={image}` + `AvatarFallback`{initials}.
- "Change photo" button → hidden `<input type="file" accept="image/png,image/jpeg,image/webp">`. On select: client-validate type + size (≤2 MB) for instant feedback; read as data URL; open a `Dialog` with `react-easy-crop` (square aspect) + a zoom `Slider` (or range input). "Save" → `getCroppedBlob` → build `FormData` (`file`, name it `avatar.webp`) → `await updateMyAvatar(fd)`; on `{ok:false}` show the error; on success `router.refresh()` + close dialog.
- "Remove" button (only when `image`) → `await removeMyAvatar()` → `router.refresh()`.
- Errors surface in a small `text-destructive` line; a pending state disables the Save/Remove buttons during the await.

- [ ] **Step 5: Run the test (GREEN)** — same command → PASS.

- [ ] **Step 6: Typecheck + commit**

```bash
git add "apps/web/app/(dashboard)/dashboard/account/avatar-field.tsx" apps/web/lib/images/crop.ts apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(avatar): AvatarField with crop dialog, initials fallback, upload + remove"
```

---

### Task 5: Account tabs (Profile / Contact / Security) + name edit + change password

**Files:**
- Modify: `apps/web/app/(dashboard)/dashboard/account/page.tsx`
- Create: `apps/web/app/(dashboard)/dashboard/account/account-tabs.tsx` (client `Tabs` shell)
- Create: `apps/web/app/(dashboard)/dashboard/account/profile-form.tsx` (name field → `updateProfile`)
- Create: `apps/web/app/(dashboard)/dashboard/account/change-password-form.tsx`
- Modify: `apps/web/app/(dashboard)/dashboard/account/actions.ts` (add `updateMyName` server action wrapping `usersService.updateProfile`)
- Test: `apps/web/app/(dashboard)/dashboard/account/__tests__/change-password-form.test.tsx`

**Interfaces:**
- Consumes: shadcn `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `AvatarField`, the existing `AccountForm` + `ResendVerification` + `Badge`, `SignOutButton`, `authClient.changePassword`, `passwordSchema`.

- [ ] **Step 1: Write the failing change-password render test**

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChangePasswordForm } from "../change-password-form";

vi.mock("@/lib/auth/client", () => ({ authClient: { changePassword: vi.fn() } }));

describe("ChangePasswordForm", () => {
  it("renders current + new password fields and a submit", () => {
    render(<ChangePasswordForm />);
    expect(screen.getByRole("button", { name: /change password|update/i })).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it (RED)** — `pnpm --filter web exec vitest run "app/(dashboard)/dashboard/account/__tests__/change-password-form.test.tsx"` → FAIL.

- [ ] **Step 3: Implement the change-password form**

Create `change-password-form.tsx` (`"use client"`, RHF + zod): fields `currentPassword`, `newPassword` (`passwordSchema`), `confirm` (must equal newPassword). Submit → `await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`; on `error` → "Current password is incorrect or the new password is invalid."; on success → `toast.success("Password updated.")` + reset the form. Show/hide toggles.

- [ ] **Step 4: Run it (GREEN)** — same command → PASS.

- [ ] **Step 5: Add `updateMyName` action + Profile form**

In `account/actions.ts` add `"use server"` `updateMyName(name: string)`: resolve `getSession`; `await usersService.updateProfile(session.user.id, { name })`; `revalidatePath("/dashboard/account")`; return `{ ok }`. (Reuse the file's existing session/guard pattern from `updateMyContact`.)

Create `profile-form.tsx` (`"use client"`): a `name` text field (RHF, ≤120) → `updateMyName` → `toast` + `router.refresh()`.

- [ ] **Step 6: Build the tabs shell + rewire the page**

Create `account-tabs.tsx` (`"use client"`) using shadcn `Tabs` with three `TabsContent`:
- **Profile**: `<AvatarField image={...} name={...} />` + `<ProfileForm name={...} />`.
- **Contact**: the existing `<AccountForm phone email defaultCountry />` + the email verify `Badge` + `<ResendVerification />` block (moved verbatim from the current Profile SectionCard).
- **Security**: `<ChangePasswordForm />` + `<SignOutButton />`.

It receives plain data props (`image`, `name`, `phone`, `email`, `emailVerified`, `defaultCountry`) from the server `page.tsx`. Rewrite `account/page.tsx` to fetch the user (as today) and render `<PageShell><PageHeader …/><AccountTabs …props/></PageShell>` instead of the two SectionCards. Keep the `getSession`→`usersService.read`→`NotFoundError`→`/login` guard logic exactly.

- [ ] **Step 7: Typecheck + commit**

Run `pnpm --filter web typecheck`.

```bash
git add "apps/web/app/(dashboard)/dashboard/account"
git commit -m "feat(account): Profile/Contact/Security tabs; avatar + name editing; change-password form"
```

---

### Task 6: Gate + integration

- [ ] **Step 1: Full gate** — run and report:
  - `pnpm --filter web typecheck` → 0 errors.
  - `pnpm --filter web exec vitest run` → all pass (the `next-id` flake passes in isolation — if ONLY that fails, note it).
  - `pnpm --filter web lint` → no NEW issues.
  - `pnpm --filter web build` → succeeds (the account page + new client components compile; `/dashboard/account` stays dynamic).

- [ ] **Step 2: Manual runbook (document; DB + dev server dependent)** — with the app running + signed in: Profile tab → upload a photo → crop → save → avatar shows; reload persists; Remove → falls back to initials. Edit name → saves. Contact tab → existing phone/email still works + verify badge. Security tab → change password with the correct current password succeeds; wrong current fails.

- [ ] **Step 3: Commit any straggler fixes**

```bash
git add apps/web
git commit -m "chore(account): phase B integration check; gate green"
```

---

## Self-Review

- **Spec coverage:** storage abstraction + local stub (T1) · avatar upload/crop/validation/remove + initials fallback (T3,T4) · `users.image` via audited service (T2) · account Tabs Profile/Contact/Security (T5) · name edit (T5) · change password in Security (T5). PIN is Phase C (out of scope).
- **Placeholders:** none — driver, sniffer, service method, and action logic are concrete; UI components specify exact fields/flows and reference the established `account-form.tsx`/`login-form.tsx` patterns.
- **Type consistency:** `StorageDriver.put/delete` (T1) used by avatar actions (T3); `updateProfile({name,image})` (T2) used by T3 + T5; `updateMyAvatar`/`removeMyAvatar` (T3) used by `AvatarField` (T4); `sniffImageType`/`extFor`/`MAX_AVATAR_BYTES` (T3) self-consistent.
- **Security:** server-generated keys, magic-byte + size validation server-side, session-resolved owner, audited writes — all in the constraints and enforced in T3.

## Follow-on
- **Phase C** — 4-digit PIN re-unlock (`/lock`, lockout/backoff).
- Swap `LocalStorageDriver` → Vercel Blob / S3 when picked (single file, no caller changes).
