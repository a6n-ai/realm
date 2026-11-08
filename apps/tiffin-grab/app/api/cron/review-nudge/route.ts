import { withCronAuth } from "@/lib/cron/auth";
import { runReviewNudges } from "@/lib/notifications/review-nudge-job";

export const dynamic = "force-dynamic";

const handle = withCronAuth(() => runReviewNudges());

export const GET = handle;
export const POST = handle;
