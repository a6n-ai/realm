import { withCronAuth } from "@/lib/cron/auth";
import { runNotificationsCron } from "@/lib/cron/notifications";

export const dynamic = "force-dynamic";

const handle = withCronAuth(runNotificationsCron);

export const GET = handle;
export const POST = handle;
