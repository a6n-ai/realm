import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

export type Creds = { email: string; password: string };

export function adminCreds(): Creds {
  return {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@tiffingrab.ca",
    password: process.env.E2E_ADMIN_PASSWORD ?? "Admin123!",
  };
}

export function customerCreds(): Creds {
  return {
    email: process.env.E2E_CUSTOMER_EMAIL ?? "customer@tiffingrab.ca",
    password: process.env.E2E_CUSTOMER_PASSWORD ?? "Customer123!",
  };
}

/**
 * Prefer API sign-in for storageState setup — avoids RHF/fill flakiness and
 * Next.js compile stalls on the login page during cold starts.
 */
export async function apiSignIn(request: APIRequestContext, creds: Creds) {
  const res = await request.post("/api/auth/sign-in/email", {
    data: { email: creds.email, password: creds.password },
  });
  expect(res.ok(), `sign-in failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

/** Password login via the auth form (OTP is primary UI; switch to password). */
export async function loginWithPassword(page: Page, creds: Creds, landed: RegExp) {
  await new LoginPage(page).loginWithPassword(creds, landed);
}

export async function loginAsAdmin(page: Page) {
  await loginWithPassword(page, adminCreds(), /\/dashboard/);
}

export async function loginAsCustomer(page: Page) {
  await loginWithPassword(page, customerCreds(), /\/(me|dashboard|subscribe)/);
}
