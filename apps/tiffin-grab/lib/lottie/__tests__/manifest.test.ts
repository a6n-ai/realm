import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOTTIE, lottiePath } from "../manifest";

describe("lottie manifest", () => {
  it("every asset records path, license, attribution, source", () => {
    for (const [name, a] of Object.entries(LOTTIE)) {
      expect(a.path, name).toBe(`/lottie/${name}.json`);
      expect(a.license, name).toBeTruthy();
      expect(a.attribution, name).toBeTruthy();
      expect(a.source, name).toMatch(/^https?:\/\//);
    }
  });

  it("every manifest asset file exists in public/lottie", () => {
    for (const name of Object.keys(LOTTIE)) {
      const p = fileURLToPath(new URL(`../../../public/lottie/${name}.json`, import.meta.url));
      expect(existsSync(p), `missing ${name}.json`).toBe(true);
    }
  });

  it("lottiePath returns the public path", () => {
    expect(lottiePath("empty-box")).toBe("/lottie/empty-box.json");
  });
});
