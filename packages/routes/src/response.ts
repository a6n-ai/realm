export function json<T>(data: T, status = 200): Response {
  const body = JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? undefined : value));
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
};

// RFC 9457 problem+json. `type` stays "about:blank" until we publish problem-type
// URIs; `title` is the status-phrase, `detail` the human message.
export function problem(status: number, detail: string, title?: string): Response {
  const body = { type: "about:blank", title: title ?? TITLES[status] ?? "Error", status, detail };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/problem+json" },
  });
}
