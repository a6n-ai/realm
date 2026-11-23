import { configCache } from "@/lib/cache";

// Filter dropdown options (plans, meal sizes, zones, organizations, lead sources...). Every writer of
// those tables evicts it, so a renamed plan or new lead source shows in the filter at once.
export const filterOptionsCache = configCache("filter-options");

export async function invalidateFilterOptions(): Promise<void> {
  await filterOptionsCache.evictAll();
}
