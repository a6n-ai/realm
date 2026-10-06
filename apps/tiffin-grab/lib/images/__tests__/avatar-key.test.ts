import { describe, expect, it } from "vitest";
import { ownAvatarKey } from "../avatar-key";

const base = "/api/files/";

describe("ownAvatarKey", () => {
  it("returns the key of the user's own upload", () => {
    expect(ownAvatarKey("/api/files/public/avatars/42-0a1b2c3d.webp", "42", base)).toBe("public/avatars/42-0a1b2c3d.webp");
  });

  it("refuses anything a user could point users.image at", () => {
    for (const url of [
      "/api/files/public/avatars/43-0a1b2c3d.webp", // another user's avatar
      "/api/files/public/menu/paneer.jpg", // a dish photo
      "/api/files/public/avatars/42-0a1b2c3d.webp/../../menu/paneer.jpg",
      "/api/files/tickets/42-0a1b2c3d.png",
      "https://lh3.googleusercontent.com/a/photo",
      "/uploads/avatars/42-0a1b2c3d.webp",
      null,
    ]) {
      expect(ownAvatarKey(url, "42", base)).toBeNull();
    }
  });

  it("does not treat a longer user id as a match", () => {
    expect(ownAvatarKey("/api/files/public/avatars/420-0a1b2c3d.webp", "42", base)).toBeNull();
  });
});
