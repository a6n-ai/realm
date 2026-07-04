/**
 * Push a freshly-created in-app notification over AppSync (WebSocket) by
 * calling the `publish` mutation, which fans out to every client subscribed to
 * that userId. Server-only: authenticated with the AppSync API key held as a
 * server secret (browsers subscribe via the Lambda authorizer instead).
 *
 * No-op when AppSync env is unset (local dev / tests / pre-deploy) so the feed
 * row is still written — the WebSocket push is best-effort.
 */
export interface BroadcastInput {
  userId: bigint;
  publicId: string;
  event: string;
  title: string;
  body: string;
  href: string | null;
}

const MUTATION =
  "mutation P($userId:String!,$notification:AWSJSON!){publish(userId:$userId,notification:$notification){userId}}";

export async function broadcast(input: BroadcastInput): Promise<void> {
  const url = process.env.APPSYNC_GRAPHQL_URL;
  const apiKey = process.env.APPSYNC_API_KEY;
  if (!url || !apiKey) return;

  const userId = String(input.userId);
  const notification = JSON.stringify({
    publicId: input.publicId,
    event: input.event,
    title: input.title,
    body: input.body,
    href: input.href,
  });

  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query: MUTATION, variables: { userId, notification } }),
  });
}
