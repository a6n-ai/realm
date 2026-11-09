import type { z } from "zod";

/** The request body as JSON, or `fallback` when it is empty or malformed. */
/** `T` is the caller's assertion of the shape; nothing is validated here. */
export const readBody = <T = unknown>(req: Request, fallback: unknown = null): Promise<T> => req.json().catch(() => fallback);

/** safeParse of the request body; an unreadable body is parsed as `fallback`, so the schema decides if that is valid. */
export async function readJson<T extends z.ZodType>(req: Request, schema: T, fallback: unknown = null): Promise<ReturnType<T["safeParse"]>> {
  return schema.safeParse(await readBody(req, fallback)) as ReturnType<T["safeParse"]>;
}
