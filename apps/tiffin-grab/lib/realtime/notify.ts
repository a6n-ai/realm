/** Redis pub/sub channel carrying "user X has a new notification" (payload: user public id). */
export const NOTIFY_PING_CHANNEL = "realtime:notify";

/** SSE channel a user's bell subscribes to. */
export const notifyChannel = (userPublicId: string) => `notify:${userPublicId}`;
