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

describe("makeStorage R2 binding selection", () => {
  const bucket = {};
  const withBinding = (env: unknown) => {
    vi.resetModules();
    vi.doMock("@opennextjs/cloudflare", () => ({
      getCloudflareContext: () => {
        if (env === undefined) throw new Error("outside a request");
        return { env };
      },
    }));
    return import("./index");
  };

  afterEach(() => {
    vi.doUnmock("@opennextjs/cloudflare");
  });

  it("uses the R2 binding when FILES and the signing secret are both present", async () => {
    vi.stubEnv("FILES_URL_SIGNING_SECRET", "s3cret");
    vi.stubEnv("FILES_S3_BUCKET", "b");
    const { makeStorage: make } = await withBinding({ FILES: bucket });
    expect(make().name).toBe("r2-binding");
  });

  it("falls back to S3 without the secret", async () => {
    vi.stubEnv("FILES_URL_SIGNING_SECRET", "");
    vi.stubEnv("FILES_S3_BUCKET", "b");
    const { makeStorage: make } = await withBinding({ FILES: bucket });
    expect(make().name).toBe("s3");
  });

  it("falls back to S3 without the binding, or outside a Worker request", async () => {
    vi.stubEnv("FILES_URL_SIGNING_SECRET", "s3cret");
    vi.stubEnv("FILES_S3_BUCKET", "b");
    expect((await withBinding({})).makeStorage().name).toBe("s3");
    expect((await withBinding(undefined)).makeStorage().name).toBe("s3");
  });
});
