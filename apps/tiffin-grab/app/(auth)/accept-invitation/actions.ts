"use server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// headers() throws outside a live request (e.g. a unit test calling this
// action directly with no HTTP request underneath it); better-auth's api
// methods work fine with undefined headers, so fall back rather than crash.
async function requestHeaders(): Promise<HeadersInit> {
  try {
    return await headers();
  } catch {
    return new Headers();
  }
}

export async function acceptInvitationAction(input: { invitationId: string; email: string; otp: string }) {
  const h = await requestHeaders();
  await auth.api.signInEmailOTP({ body: { email: input.email, otp: input.otp }, headers: h });
  await auth.api.acceptInvitation({ body: { invitationId: input.invitationId }, headers: h });
  return { ok: true };
}
