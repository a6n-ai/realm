import { describe, expect, it } from "vitest";
import {
  parseCloverWebhookBody,
  parseCloverWebhookObjectId,
  safeEqualString,
  verifyCloverWebhookAuth,
} from "../webhooks";
import { mapCloverRemoteToPaymentStatus } from "../orders";

describe("verifyCloverWebhookAuth", () => {
  it("accepts matching auth codes", () => {
    expect(verifyCloverWebhookAuth("abc-123", "abc-123")).toBe(true);
  });

  it("rejects mismatch or empty", () => {
    expect(verifyCloverWebhookAuth("abc", "xyz")).toBe(false);
    expect(verifyCloverWebhookAuth("abc", "")).toBe(false);
    expect(verifyCloverWebhookAuth(null, "abc")).toBe(false);
  });
});

describe("safeEqualString", () => {
  it("compares equal lengths only", () => {
    expect(safeEqualString("aa", "aa")).toBe(true);
    expect(safeEqualString("aa", "ab")).toBe(false);
    expect(safeEqualString("a", "aa")).toBe(false);
  });
});

describe("parseCloverWebhookObjectId", () => {
  it("splits kind and id", () => {
    expect(parseCloverWebhookObjectId("P:PAY123")).toEqual({ kind: "P", id: "PAY123" });
    expect(parseCloverWebhookObjectId("O:ORD99")).toEqual({ kind: "O", id: "ORD99" });
  });

  it("rejects malformed", () => {
    expect(parseCloverWebhookObjectId("PAY123")).toBeNull();
    expect(parseCloverWebhookObjectId(":x")).toBeNull();
    expect(parseCloverWebhookObjectId("P:")).toBeNull();
  });
});

describe("parseCloverWebhookBody", () => {
  it("detects verification setup", () => {
    expect(parseCloverWebhookBody({ verificationCode: "  code-1  " })).toEqual({
      kind: "verification",
      verificationCode: "code-1",
    });
  });

  it("flattens merchant updates", () => {
    const parsed = parseCloverWebhookBody({
      appId: "APP1",
      merchants: {
        M1: [
          { objectId: "P:PAY1", type: "CREATE", ts: 1 },
          { objectId: "O:ORD1", type: "UPDATE", ts: 2 },
        ],
      },
    });
    expect(parsed.kind).toBe("notification");
    if (parsed.kind !== "notification") return;
    expect(parsed.appId).toBe("APP1");
    expect(parsed.updates).toHaveLength(2);
    expect(parsed.updates[0]).toMatchObject({ merchantId: "M1", objectId: "P:PAY1", type: "CREATE" });
  });
});

describe("mapCloverRemoteToPaymentStatus", () => {
  it("maps paid signals", () => {
    expect(mapCloverRemoteToPaymentStatus({ chargeStatus: "succeeded" })).toBe("paid");
    expect(mapCloverRemoteToPaymentStatus({ chargePaid: true })).toBe("paid");
    expect(mapCloverRemoteToPaymentStatus({ paymentResult: "SUCCESS" })).toBe("paid");
    expect(mapCloverRemoteToPaymentStatus({ paymentState: "PAID" })).toBe("paid");
  });

  it("maps failed signals", () => {
    expect(mapCloverRemoteToPaymentStatus({ chargeStatus: "failed" })).toBe("failed");
    expect(mapCloverRemoteToPaymentStatus({ paymentResult: "FAIL" })).toBe("failed");
  });

  it("defaults to awaiting", () => {
    expect(mapCloverRemoteToPaymentStatus({ chargeStatus: "pending" })).toBe("awaiting_payment");
    expect(mapCloverRemoteToPaymentStatus({})).toBe("awaiting_payment");
  });
});
