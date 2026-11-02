import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental/tag cache: every page is dynamic (no ISR, unstable_cache or
// "use cache"), so revalidatePath only clears the client router cache.
export default defineCloudflareConfig();
