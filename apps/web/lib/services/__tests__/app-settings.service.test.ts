import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { getAppSettings } from "../app-settings.service";

async function reset() { await db.delete(appSettings); }

describe("getAppSettings", () => {
  beforeEach(reset);
  afterAll(reset);

  it("returns defaults when no row exists", async () => {
    const s = await getAppSettings();
    expect(s).toEqual({ timezone: "America/Toronto", cutoffHour: 18 });
  });

  it("returns the stored row when present", async () => {
    await db.insert(appSettings).values({ timezone: "America/Vancouver", cutoffHour: 20 });
    const s = await getAppSettings();
    expect(s).toEqual({ timezone: "America/Vancouver", cutoffHour: 20 });
  });
});
