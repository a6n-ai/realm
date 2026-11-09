import { withCronAuth as withCronAuthFor } from "@foundry/cloud/cron-auth";
import { cronSecret } from "@/lib/runtime/env";

export const withCronAuth = withCronAuthFor(cronSecret);
