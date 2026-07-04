import { describe, expect, it } from "vitest";
import { S3StorageProvider } from "./s3-provider";

describe("S3StorageProvider", () => {
  it("constructs for an S3-compatible endpoint (R2/MinIO) with path-style", () => {
    const s = new S3StorageProvider({
      bucket: "b",
      region: "auto",
      endpoint: "https://example.r2.cloudflarestorage.com",
      credentials: { accessKeyId: "k", secretAccessKey: "s" },
      forcePathStyle: true,
    });
    expect(s.name).toBe("s3");
  });

  it("constructs for AWS S3 (no endpoint)", () => {
    const s = new S3StorageProvider({ bucket: "b", region: "us-east-1" });
    expect(s.name).toBe("s3");
  });
});
