import { revalidatePath } from "next/cache";

// Public pages live under app/site/[org] (rewritten from /, /menu...), and Next revalidates a rewritten
// route by its destination path. Call after the shared data caches are evicted.
export function revalidatePublicSite(): void {
  try {
    revalidatePath("/site/[org]", "layout");
  } catch {
    // outside a request scope (seed scripts, services called from tests)
  }
}
