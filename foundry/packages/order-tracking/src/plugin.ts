import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import * as z from "zod";
import { decideTrackingAccess, MAX_PIN_ATTEMPTS, type TrackingSubject } from "./access";

/** Longer than any order lives, short enough that a shared device forgets. */
export const TRACKING_GRANT_MAX_AGE_S = 7 * 24 * 60 * 60;

/**
 * One cookie per tracked order, so tracking a second order does not evict the
 * first. Path stays "/" because the grant is read back through an auth endpoint
 * under /api/auth — a cookie scoped to the tracking page would never be sent
 * there.
 */
export function trackingCookieName(orderId: string): string {
  return `track_${orderId}`;
}

export type OrderTrackingOptions = {
  /**
   * Look up just enough of the order to decide access. Returning null is a 404.
   * Deliberately not the whole order: the auth layer has no business holding a
   * pricing snapshot.
   */
  resolve: (orderId: string) => Promise<TrackingSubject | null>;
};

const orderIdSchema = z.object({ orderId: z.string().trim().min(1).max(64) });

/**
 * Typed as `string`, but an adapter over a bigint `users.id` hands back a
 * bigint at runtime — so both sides of the ownership check are stringified
 * rather than compared with `===` on mixed types (which is always false).
 */
function viewerId(session: { user?: { id?: unknown } } | null): string | null {
  const id = session?.user?.id;
  return id === null || id === undefined ? null : String(id);
}

/**
 * Guest access to a public order-tracking page, as a Better Auth plugin.
 *
 * Better Auth owns the cookie signing (its secret, `__Secure-` prefix, secure
 * flags in production), the per-IP rate limit, and trusted-origin checks. This
 * plugin only adds the PIN rule on top.
 *
 * Not the `anonymous` plugin: that mints a real user row per guest, and these
 * apps surface `users` in admin listings with a status lifecycle attached. A
 * tracking grant is a capability scoped to one order, not a person.
 */
export const orderTracking = (options: OrderTrackingOptions) => {
  async function subjectOr404(orderId: string): Promise<TrackingSubject> {
    const subject = await options.resolve(orderId);
    // With ~71-bit order ids there is no enumeration to defend against, so a
    // plain 404 costs nothing and a fake PIN prompt would only confuse.
    if (!subject) throw new APIError("NOT_FOUND", { message: "Order not found" });
    return subject;
  }

  return {
    id: "order-tracking",
    endpoints: {
      /** Has this browser already been granted access to this order? */
      getOrderTrackingGrant: createAuthEndpoint(
        "/order-tracking/grant",
        { method: "GET", query: orderIdSchema },
        async (ctx) => {
          const { orderId } = ctx.query;
          const subject = await subjectOr404(orderId);

          const session = await getSessionFromCtx(ctx).catch(() => null);
          const viewerUserId = viewerId(session);
          if (viewerUserId && subject.ownerUserId && viewerUserId === subject.ownerUserId) {
            return ctx.json({ granted: true, via: "session" as const });
          }

          const cookie = await ctx.getSignedCookie(
            trackingCookieName(orderId),
            ctx.context.secret,
          );
          return ctx.json({
            granted: cookie === orderId,
            via: "pin" as const,
          });
        },
      ),

      /** Exchange the order's PIN for a signed grant cookie. */
      verifyOrderTrackingPin: createAuthEndpoint(
        "/order-tracking/verify",
        { method: "POST", body: orderIdSchema.extend({ pin: z.string().trim().max(16) }) },
        async (ctx) => {
          const { orderId, pin } = ctx.body;
          const subject = await subjectOr404(orderId);

          const session = await getSessionFromCtx(ctx).catch(() => null);
          const decision = decideTrackingAccess({
            orderId,
            subject,
            viewerUserId: viewerId(session),
            pin,
          });

          if (decision === "locked") {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: `Too many attempts. Try again later.`,
              code: "TRACKING_PIN_LOCKED",
            });
          }
          if (decision !== "granted") {
            throw new APIError("UNAUTHORIZED", {
              message: "That PIN does not match this order.",
              code: "TRACKING_PIN_INVALID",
            });
          }

          await ctx.setSignedCookie(
            trackingCookieName(orderId),
            orderId,
            ctx.context.secret,
            { httpOnly: true, sameSite: "lax", path: "/", maxAge: TRACKING_GRANT_MAX_AGE_S },
          );
          return ctx.json({ granted: true });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/order-tracking/verify",
        max: MAX_PIN_ATTEMPTS,
        window: 15 * 60,
      },
    ],
  } satisfies BetterAuthPlugin;
};
