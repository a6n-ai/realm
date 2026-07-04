export function json<T>(data: T, status = 200): Response {
  const body = JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? undefined : value));
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}
