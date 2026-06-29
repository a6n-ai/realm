import { util, extensions } from "@aws-appsync/utils";

// Enhanced subscription filter: a client only receives publishes whose userId
// matches the one it subscribed with (the authorizer guarantees the client may
// only subscribe to its own id).
export function request() {
  return { payload: null };
}

export function response(ctx) {
  // Pin the filter to the authorizer-resolved id, NOT the client argument —
  // a client can only ever receive its own notifications.
  const userId = ctx.identity?.resolverContext?.userId;
  if (!userId) util.unauthorized();
  extensions.setSubscriptionFilter(
    util.transform.toSubscriptionFilter({ userId: { eq: userId } }),
  );
  return null;
}
