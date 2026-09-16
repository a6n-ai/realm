---
name: tiffin-grab-e2e-flow
description: Runs Tiffin Grab's core cross-role business flow end-to-end in a real browser — an admin releasing a weekly menu, a customer ordering and customizing a meal, changing their delivery address, an admin downloading packing labels, a customer raising a complaint, and an admin resolving it. Use this whenever the user asks to test Tiffin Grab end-to-end, run E2E/smoke checks, verify the ordering flow, verify menu release or packing labels, or check that the customer-to-admin complaint/ticket loop works — including phrasing like "run test cases for tiffin grab", "does the order flow still work", "smoke test tiffin grab", or "verify this week's menu release." This complements (does not replace) the existing Playwright suite in apps/tiffin-grab/e2e — that suite is fast, scripted UI/navigation smoke coverage; this skill drives a real browser against real (often messier, more representative) database state to catch the things Playwright's clean fixtures don't, like schema drift or real visual regressions.
---

# Tiffin Grab: cross-role E2E flow

## Why this exists, and why it's not just more Playwright

`apps/tiffin-grab/e2e/*.spec.ts` already covers navigation and form-field smoke checks (sidebar links, required fields, settings cards). It runs against a clean, migrated test database, so it won't catch things that only show up against the *actual* local dev database — accumulated seed data, migration drift, stale rows. The 7-step flow below is exactly the kind of thing that surfaces those problems: it's long, stateful, crosses the admin/customer boundary repeatedly, and touches file downloads (labels) that are awkward to assert against in Playwright.

Treat this as an experienced human tester would: follow the steps, but actually look at what renders, read error messages instead of just checking for a 200 status, and use judgment about what "looks wrong" even if no assertion says so. If something breaks, that's a genuine finding — write it up like a bug report (what you did, what you expected, what actually happened, and the likely root cause if you can find it in the code), not just "step 3 failed."

## Before you start

**Pick a target.** Default to local dev unless the user names a URL:
- **Local (default)**: use `preview_start` with the `tiffin-grab-dev` config from the repo root's `.claude/launch.json` (port 3002). Confirm it's actually serving before driving it.
- **A given URL** (staging/deployed): navigate the Browser pane there directly. Skip the reseed step below — you don't control credentials on a deployed environment, so ask the user for a login, or restrict yourself to whatever role you can already reach.

**Get known logins (local only).** Don't guess credentials or try to sign up fresh accounts — run the project's seed script, which is specifically built for this and refuses to run against anything but a local database:

```bash
cd apps/tiffin-grab && pnpm tsx scripts/reseed-e2e-users.ts
```

This sets (unless overridden via `E2E_ADMIN_EMAIL` etc.):
- Admin — `info@foodmonks.ca` / `AdminDev123!`
- Customer — `customer@tiffingrab.ca` / `Customer123!`

The script hard-fails if `DATABASE_URL` isn't `localhost`/`127.0.0.1`/`::1` — if it errors for that reason, you're pointed at something that isn't local dev; stop and tell the user rather than working around it.

**Two browser identities.** Admin and customer are different accounts signed in at the same time conceptually, but one browser tab only holds one session. Use two tabs (`tabs_create`) — one signed in as admin, one as customer — rather than repeatedly signing in and out, so you can bounce between "admin does X" and "customer sees X" without losing either session.

## The flow

Run these in order — later steps depend on earlier ones (the customer can't order a menu that doesn't exist yet, labels can't print for a week with no orders). Within a step, verify by *reading the actual page*, not just checking that navigation didn't error — screenshot or read_page and confirm the content matches what the action should have produced.

### 1. Admin releases the weekly menu
Sign in as admin, go to `/dashboard/menus`, open or create the current week (`/dashboard/menus/[week]`), and publish it. Confirm: the week shows as published/live in the admin view, and separately, that the customer-facing menu picker actually reflects it (check this from the customer tab in step 2, not here — don't assume).

### 2. Customer selects menu/products
From the customer tab, go to `/me/meals` (or wherever the current flow starts — check the customer nav if this has moved) and pick the items released in step 1. Confirm the items you expected are actually selectable and match what admin published.

### 3. Customer changes delivery address
Still as customer, go to `/me/address` and change the delivery address for the next upcoming delivery (tomorrow, typically). Confirm the change is saved and reflected wherever the app shows the active delivery address.

### 4. Customer customizes a meal
Pick a meal that supports customization and make a concrete, checkable substitution — e.g. 2 veg + 1 dal, rice instead of roti (or whatever swap options actually exist today; look at what's offered rather than assuming this exact combination is still available). Confirm the customization is saved and itemized, not silently dropped.

### 5. Admin downloads packing labels and verifies changes reflected
Back in the admin tab, go to `/dashboard/labels` or `/dashboard/downloads/labels` for tomorrow's date and download labels. Confirm the downloaded file actually contains the address change from step 3 and the meal customization from step 4 — this is the step most likely to silently show stale data if something upstream didn't actually persist, so don't just confirm the download succeeded, open/read it.

### 6. Customer raises a complaint
As customer, go to `/me/support/new`, file a ticket about the order. Confirm it's created and visible in `/me/support`.

### 7. Admin resolves the ticket
As admin, go to `/dashboard/tickets`, find the ticket from step 6, and resolve/close it. Confirm the status change is visible both in the admin ticket list and back on the customer's `/me/support` view.

## When a step fails

Report it and move on to whatever's next that doesn't depend on the failed step — don't let one broken step block verification of everything downstream of it that's actually independent. (Steps 1–2 and 6–7 are sequentially dependent; a labels-download bug in step 5 doesn't block you from still checking steps 6–7 work, for instance.)

For each failure, capture:
- What you did (the exact action/page).
- What you expected to happen.
- What actually happened (error text, wrong data, missing element — be specific).
- If you can find it quickly by reading the relevant service/route code, a likely root cause — but don't go down a long debugging rabbit hole; a well-described symptom is more useful than a half-finished fix.

Do **not** silently patch the bug and re-run as if nothing happened — this skill is for finding out if the flow works, not for making it look like it does. If the user separately asks you to fix what you found, that's a different, explicit task.

## Output

End with a short structured summary: each of the 7 steps, pass or fail, one line each. For failures, the bug-report detail above. This is what the user is actually asking for — don't bury it in a wall of narration about every click.
