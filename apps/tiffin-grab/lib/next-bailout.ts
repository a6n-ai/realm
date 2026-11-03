import { unstable_rethrow } from "next/navigation";

// Under `dynamic = "error"` headers() throws StaticGenBailoutError. Callers that treat any throw as
// "no request" must let it through, or a cached page silently renders brand data for every franchise.
export function rethrowNextInternal(err: unknown): void {
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "NEXT_STATIC_GEN_BAILOUT") throw err;
  unstable_rethrow(err);
}
