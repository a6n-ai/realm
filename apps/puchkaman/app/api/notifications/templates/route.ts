import { handler } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { listTemplates, upsertTemplate } from "@/lib/services/notification-template.service";

export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  return Response.json(await listTemplates());
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const body = await req.json();
  await upsertTemplate(body);
  return Response.json({ ok: true });
});
