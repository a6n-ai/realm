import { handler, json, problem } from "@foundry/routes";
import { saveEmailTemplateSchema } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import type { AppEvent } from "@/lib/notifications/event-entities";
import { listTemplates, saveTemplateEmail, upsertTemplate } from "@/lib/services/notification-template.service";

export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  return Response.json(await listTemplates());
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const raw = await req.json().catch(() => null);
  if (raw?.channel !== "email") {
    await upsertTemplate(raw);
    return Response.json({ ok: true });
  }
  const parsed = saveEmailTemplateSchema.safeParse(raw);
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  const result = await saveTemplateEmail({ ...parsed.data, event: parsed.data.event as AppEvent });
  if ("error" in result) return problem(result.status, result.error);
  return json(result);
});
