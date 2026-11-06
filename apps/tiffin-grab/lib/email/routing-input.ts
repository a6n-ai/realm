import { EMAIL_EVENT_TYPES, type EmailEventType } from "@relay/email";

export function parseRoutingInput(input: unknown): { webhook: EmailEventType[]; counts?: EmailEventType[] } | null {
  if (!input || typeof input !== "object") return null;
  const { webhook, counts } = input as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v) && v.every((t) => typeof t === "string" && (EMAIL_EVENT_TYPES as readonly string[]).includes(t))
      ? (v as EmailEventType[])
      : null;
  const w = list(webhook);
  if (!w) return null;
  if (counts === undefined) return { webhook: w };
  const c = list(counts);
  return c ? { webhook: w, counts: c } : null;
}
