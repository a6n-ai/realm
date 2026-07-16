import { afterEach, describe, expect, it, vi } from "vitest";
import { makeStorage } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("makeStorage", () => {
  it("uses S3 with no static credentials, so the SDK falls back to the instance role", () => {
    vi.stubEnv("FILES_S3_BUCKET", "tiffin-grab-prod-files");
    vi.stubEnv("FILES_S3_REGION", "us-east-1");
    vi.stubEnv("FILES_S3_ACCESS_KEY_ID", "");
    vi.stubEnv("FILES_S3_SECRET_ACCESS_KEY", "");
    expect(makeStorage().name).toBe("s3");
  });

  it("still accepts static credentials (MinIO/R2 dev)", () => {
    vi.stubEnv("FILES_S3_BUCKET", "dev");
    vi.stubEnv("FILES_S3_ENDPOINT", "http://localhost:9000");
    vi.stubEnv("FILES_S3_ACCESS_KEY_ID", "minio");
    vi.stubEnv("FILES_S3_SECRET_ACCESS_KEY", "minio123");
    expect(makeStorage().name).toBe("s3");
  });

  it("refuses to fall back to local disk in production", () => {
    vi.stubEnv("FILES_S3_BUCKET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => makeStorage()).toThrow(/refusing to store files on ephemeral container disk/);
  });

  it("falls back to local disk outside production", () => {
    vi.stubEnv("FILES_S3_BUCKET", "");
    expect(makeStorage().name).toBe("local");
  });
});
