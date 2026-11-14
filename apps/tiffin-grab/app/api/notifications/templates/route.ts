import { readBody } from "@foundry/commons/util/http";
import { problem } from "@foundry/routes";
import { saveEmailTemplateSchema } from "@relay/engine";
import { adminRoute } from "@/lib/notifications/admin-route";
import type { AppEvent } from "@/lib/notifications/event-entities";
import { listTemplates, saveTemplateEmail, upsertTemplate, type UpsertInput } from "@/lib/notifications/notification-template.service";

export const GET = adminRoute(listTemplates);

export const POST = adminRoute(async (req) => {
  const raw = await readBody<{ channel?: string } | null>(req);
  if (raw?.channel !== "email") {
    await upsertTemplate(raw as UpsertInput);
    return { ok: true };
  }
  const parsed = saveEmailTemplateSchema.safeParse(raw);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return saveTemplateEmail({ ...parsed.data, event: parsed.data.event as AppEvent });
});
