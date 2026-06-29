import type { AppSyncAuthorizerHandler } from "aws-lambda";
import { jwtVerify } from "jose";

/**
 * Verify the app-minted WS token. `sub` carries the user's internal id, which
 * becomes resolverContext.userId — the subscription resolver filters on it, so
 * a client can never receive another user's notifications.
 */
export const handler: AppSyncAuthorizerHandler<{ userId: string }> = async (event) => {
  try {
    const secret = process.env.APPSYNC_AUTH_SECRET;
    if (!secret) return { isAuthorized: false };
    const { payload } = await jwtVerify(event.authorizationToken, new TextEncoder().encode(secret));
    const userId = payload.sub;
    if (!userId) return { isAuthorized: false };
    return { isAuthorized: true, resolverContext: { userId }, ttlOverride: 300 };
  } catch {
    return { isAuthorized: false };
  }
};
