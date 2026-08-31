import { NextResponse } from "next/server";
import {
  consumeCloverOAuthState,
  exchangeCloverAuthorizationCode,
  loadCloverAppCredentialsFromEnv,
  parseCloverOAuthCallback,
  persistCloverOAuthConnection,
} from "@foundry/clover";
import { getSession } from "@/lib/auth/session";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

function settingsRedirect(request: Request, query: Record<string, string>) {
  const url = new URL("/dashboard/settings/clover", request.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/**
 * Clover OAuth callback — exchanges `code` for tokens and persists connection.
 * Secrets never leave the server; the admin UI only sees a public projection.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const cb = parseCloverOAuthCallback(searchParams);

  if (cb.error) {
    return settingsRedirect(request, { clover: "error", reason: cb.error });
  }
  if (!(await consumeCloverOAuthState(cb.state))) {
    return settingsRedirect(request, { clover: "error", reason: "invalid_state" });
  }
  if (!cb.code || !cb.merchantId) {
    return settingsRedirect(request, { clover: "error", reason: "missing_code" });
  }

  const credentials = loadCloverAppCredentialsFromEnv();
  if (!credentials) {
    return settingsRedirect(request, { clover: "error", reason: "missing_credentials" });
  }

  try {
    const tokens = await exchangeCloverAuthorizationCode({
      credentials,
      code: cb.code,
    });
    await persistCloverOAuthConnection(integrationsConfigStore, {
      credentials,
      merchantId: cb.merchantId,
      tokens,
    });
    await recordAudit({
      entity: "integrations",
      entityPublicId: "clover",
      operation: "update",
      changes: { _action: "clover_connect", merchantId: cb.merchantId },
      createdBy: await currentUserId(),
    });
    return settingsRedirect(request, { clover: "connected" });
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 120) : "token_exchange_failed";
    return settingsRedirect(request, { clover: "error", reason });
  }
}
