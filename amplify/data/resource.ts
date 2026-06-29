import { a, defineData, type ClientSchema } from "@aws-amplify/backend";
import { appsyncAuthorizer } from "../functions/appsync-authorizer/resource";

/**
 * Real-time transport only — NOT the source of truth. Postgres (via Drizzle)
 * owns notification data. This API exists to push events over WebSocket:
 *
 *   server  --publish(userId, notification)-->  AppSync  --onNotification-->  clients
 *
 * `publish` runs on a NONE data source (touches no DB) and just relays its
 * arguments to the matching subscription, filtered per-user.
 */
const schema = a
  .schema({
    NotificationEvent: a.customType({
      userId: a.string().required(),
      notification: a.json(),
    }),

    // Server-only (API key held as a server secret). Fans out to subscribers.
    publish: a
      .mutation()
      .arguments({ userId: a.string().required(), notification: a.json() })
      .returns(a.ref("NotificationEvent"))
      .handler(a.handler.custom({ entry: "./publish.js" }))
      .authorization((allow) => [allow.publicApiKey()]),

    // Clients subscribe; the Lambda authorizer resolves the caller's userId and
    // the resolver pins the subscription filter to it (no cross-user leakage).
    onNotification: a
      .subscription()
      .for(a.ref("publish"))
      .arguments({ userId: a.string().required() })
      .handler(a.handler.custom({ entry: "./receive.js" }))
      .authorization((allow) => [allow.authenticated()]),
  })
  .authorization((allow) => [allow.resource(appsyncAuthorizer)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Browser clients are authenticated by the Auth.js-bridging Lambda.
    defaultAuthorizationMode: "lambda",
    lambdaAuthorizationMode: { function: appsyncAuthorizer, timeToLiveInSeconds: 300 },
    // Server-side publish uses the API key.
    apiKeyAuthorizationMode: { expiresInDays: 365 },
  },
});
