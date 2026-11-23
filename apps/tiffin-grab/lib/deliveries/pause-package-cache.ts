import { configCache } from "@/lib/cache";

// Duration package pause limits for the display paths. Every duration_packages write evicts it.
export const pausePkgCache = configCache("pause-pkg");

export async function invalidatePausePackages(): Promise<void> {
  await pausePkgCache.evictAll();
}
