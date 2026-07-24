import { test, expect } from "../fixtures";
import { ALL_ADMIN_ROUTES } from "./routes";
import { AdminShell } from "../pages/admin.shell";

test.describe("admin feature smoke (desktop)", () => {
  for (const route of ALL_ADMIN_ROUTES) {
    test(`loads ${route.id} (${route.path})`, async ({ page, gotoOk, expectHealthy }) => {
      await gotoOk(page, route.path);

      if (route.finalPath) {
        await expect(page).toHaveURL(route.finalPath, { timeout: 15_000 });
      }

      await expectHealthy(page, route.heading);
      await new AdminShell(page).expectNav();
    });
  }
});
