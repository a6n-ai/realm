// Live-DB project only (see vitest.config): the shared stubs plus catalog restore.
import { afterAll } from "vitest";
import { ensureSeededCatalog } from "./db/test-helpers";

// Restore the seeded catalog if a suite blanket-deleted dishes in its cleanup.
afterAll(async () => {
  await ensureSeededCatalog();
});
