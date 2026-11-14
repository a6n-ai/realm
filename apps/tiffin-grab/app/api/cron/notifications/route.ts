import { cronRoutes } from "@/lib/cron/route";
import { runNotificationsCron } from "@/lib/cron/notifications";

export const dynamic = "force-dynamic";

export const { GET, POST } = cronRoutes(runNotificationsCron);
