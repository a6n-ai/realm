import { describe, expect, it } from "vitest";
import { MAX_CLASS_PHOTOS, parsePhotos } from "../photos";

describe("parsePhotos", () => {
  it("keeps uploaded file URLs and drops blanks", () => {
    expect(parsePhotos(["/api/files/public/classes/a.png", "", "/api/files/public/classes/a.png"])).toEqual([
      "/api/files/public/classes/a.png",
    ]);
  });

  it("rejects a remote URL that was not uploaded", () => {
    expect(() => parsePhotos(["https://evil.example/x.png"])).toThrow(/uploaded/);
  });

  it("caps the number of photos", () => {
    const urls = Array.from({ length: MAX_CLASS_PHOTOS + 1 }, (_, i) => `/api/files/public/classes/${i}.png`);
    expect(() => parsePhotos(urls)).toThrow(/6 photos/);
  });
});
