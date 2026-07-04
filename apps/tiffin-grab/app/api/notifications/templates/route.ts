import { requireAdmin } from "@/lib/auth/guards";
import { listTemplates, upsertTemplate } from "@/lib/services/notification-template.service";

export async function GET(): Promise<Response> {
  await requireAdmin();
  return Response.json(await listTemplates());
}

export async function POST(req: Request): Promise<Response> {
  await requireAdmin();
  const body = await req.json();
  await upsertTemplate(body);
  return Response.json({ ok: true });
}
