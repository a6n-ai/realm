// NONE-data-source resolver: relay the mutation arguments straight to the
// subscription. No persistence — Postgres already holds the notification.
export function request() {
  return { payload: null };
}

export function response(ctx) {
  return ctx.arguments;
}
