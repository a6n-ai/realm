// Completion pull is not scheduled. This route used to call pullCompletions for
// "today" when something curled it with the cron bearer (the old note suggested
// 22:00 IST). That unattended run was skipping deliveries whenever OptimoRoute did
// not report success. Staff still pull a chosen date from Dispatch → Completions.
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    skipped: "completion pull scheduler is disabled",
    date: null,
    outcomes: [],
  });
}

export const GET = handle;
export const POST = handle;
