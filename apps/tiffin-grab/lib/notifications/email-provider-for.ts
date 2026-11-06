import type { EmailProvider } from "@relay/email";
import { getTrackedEmailProvider } from "@/lib/email/provider";
import { getTrackedEmailEvents } from "@/lib/services/app-settings.service";
import { eventCategory } from "./event-categories";

/** Per-send stream choice, read from settings on every call; undefined means the default provider. */
export async function emailProviderFor(event: string): Promise<EmailProvider | undefined> {
  if (!event || eventCategory(event) === "account") return undefined;
  const tracked = getTrackedEmailProvider();
  if (!tracked) return undefined;
  return (await getTrackedEmailEvents()).includes(event) ? (tracked) : undefined;
}
