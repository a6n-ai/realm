import type { ChatMessage } from "@foundry/design-system";

const dayKey = (t: number, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);

export const chatTime = (t: number, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(t).toLowerCase();

/** "Today", "Yesterday", else "Mon, Oct 5" (with the year when it isn't this year). */
export function chatDayLabel(t: number, tz: string, now = Date.now()): string {
  const key = dayKey(t, tz);
  if (key === dayKey(now, tz)) return "Today";
  if (key === dayKey(now - 864e5, tz)) return "Yesterday";
  const sameYear = key.slice(0, 4) === dayKey(now, tz).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(t);
}

/**
 * WhatsApp-style thread: a date chip (system item with empty meta) wherever the day
 * changes, and each message's meta is just its time. Both support chats use this.
 */
export function withDayChips<M extends { publicId: string; createdAt: number }>(
  messages: M[],
  tz: string,
  toMessage: (m: M, time: string) => ChatMessage,
): ChatMessage[] {
  const out: ChatMessage[] = [];
  let prev = "";
  for (const m of messages) {
    const key = dayKey(m.createdAt, tz);
    if (key !== prev) {
      out.push({ id: `day:${key}`, kind: "system", body: chatDayLabel(m.createdAt, tz), meta: "" });
      prev = key;
    }
    out.push(toMessage(m, chatTime(m.createdAt, tz)));
  }
  return out;
}
