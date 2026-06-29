import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * AppSync Lambda authorizer. Bridges Auth.js → AppSync: verifies the
 * short-lived HS256 token the app mints at /api/notifications/ws-token and
 * returns the caller's userId as resolver context (used to pin the
 * subscription filter). Shared secret with that route.
 */
export const appsyncAuthorizer = defineFunction({
  name: "appsync-authorizer",
  entry: "./handler.ts",
  environment: {
    APPSYNC_AUTH_SECRET: secret("APPSYNC_AUTH_SECRET"),
  },
});
