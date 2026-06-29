"use client";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/api";

const ENDPOINT = process.env.NEXT_PUBLIC_APPSYNC_URL;
const REGION = process.env.NEXT_PUBLIC_AWS_REGION ?? "ca-central-1";

const SUBSCRIPTION = /* GraphQL */ `
  subscription OnNotification($userId: String!) {
    onNotification(userId: $userId) { userId notification }
  }
`;

export interface RealtimeNotification {
  publicId: string;
  event: string;
  title: string;
  body: string;
  href: string | null;
}

let configured = false;
function ensureConfigured(): boolean {
  if (!ENDPOINT) return false;
  if (!configured) {
    Amplify.configure({
      API: { GraphQL: { endpoint: ENDPOINT, region: REGION, defaultAuthMode: "lambda" } },
    });
    configured = true;
  }
  return true;
}

async function fetchToken(): Promise<{ token: string; userId: string } | null> {
  const res = await fetch("/api/notifications/ws-token");
  if (!res.ok) return null;
  return res.json();
}

/**
 * Open the per-user notification subscription. Returns an unsubscribe fn.
 * No-op (returns a noop) when AppSync isn't configured (env unset / pre-deploy)
 * — the bell still works via the REST feed.
 */
export async function subscribeNotifications(
  onEvent: (n: RealtimeNotification) => void,
): Promise<() => void> {
  if (!ensureConfigured()) return () => {};
  const auth = await fetchToken();
  if (!auth) return () => {};

  const client = generateClient();
  // graphql() is overloaded query→Promise / subscription→Observable; narrow it.
  const observable = client.graphql({
    query: SUBSCRIPTION,
    variables: { userId: auth.userId },
    authMode: "lambda",
    authToken: auth.token,
  }) as unknown as {
    subscribe(observer: {
      next: (value: { data?: { onNotification?: { notification?: string } } }) => void;
      error: (err: unknown) => void;
    }): { unsubscribe(): void };
  };

  const sub = observable.subscribe({
    next: ({ data }) => {
      const raw = data?.onNotification?.notification;
      if (!raw) return;
      try {
        onEvent(JSON.parse(raw) as RealtimeNotification);
      } catch {
        /* ignore malformed payloads */
      }
    },
    error: (err) => console.warn("notification subscription error", err),
  });

  return () => sub.unsubscribe();
}
