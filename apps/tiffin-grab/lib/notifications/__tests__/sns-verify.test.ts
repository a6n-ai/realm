import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { verifySnsMessage, type SnsMessage } from "../sns-verify";

const CERT_URL = "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem";

// Minimal DER builders: just enough for a structurally valid, genuinely signed self-signed X.509 cert.
const len = (n: number) => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const tlv = (tag: number, body: Buffer) => Buffer.concat([Buffer.from([tag, ...len(body.length)]), body]);
const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const sha256Rsa = seq(tlv(0x06, Buffer.from("2a864886f70d01010b", "hex")), Buffer.from([5, 0]));
const name = seq(tlv(0x31, seq(tlv(0x06, Buffer.from("550403", "hex")), tlv(0x0c, Buffer.from("test")))));
const time = (s: string) => tlv(0x17, Buffer.from(s));

function selfSignedPem(priv: KeyObject, pub: KeyObject): string {
  const tbs = seq(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, Buffer.from([1])),
    sha256Rsa,
    name,
    seq(time("250101000000Z"), time("350101000000Z")),
    name,
    pub.export({ type: "spki", format: "der" }),
  );
  const sig = createSign("SHA256").update(tbs).sign(priv);
  const der = seq(tbs, sha256Rsa, tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
  return `-----BEGIN CERTIFICATE-----\n${der.toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END CERTIFICATE-----\n`;
}

const NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const;
const CONFIRM_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const;

function sign(msg: Record<string, string>, priv: KeyObject, version: "1" | "2"): SnsMessage {
  const keys = msg.Type === "Notification" ? NOTIFICATION_KEYS : CONFIRM_KEYS;
  const canonical = keys.filter((k) => k in msg).map((k) => `${k}\n${msg[k]}\n`).join("");
  const signature = createSign(version === "1" ? "SHA1" : "SHA256").update(canonical).sign(priv, "base64");
  return { ...msg, SignatureVersion: version, Signature: signature, SigningCertURL: CERT_URL } as SnsMessage;
}

const base = { MessageId: "m-1", TopicArn: "arn:aws:sns:us-east-1:123:ses", Timestamp: "2026-11-02T10:00:00.000Z" };
let priv: KeyObject;
let pem: string;
const fetchMock = vi.fn();

beforeAll(() => {
  const kp = generateKeyPairSync("rsa", { modulusLength: 2048 });
  priv = kp.privateKey;
  pem = selfSignedPem(kp.privateKey, kp.publicKey);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function stubCert() {
  fetchMock.mockImplementation(async () => new Response(pem));
  vi.stubGlobal("fetch", fetchMock);
}

describe("verifySnsMessage", () => {
  it.each(["1", "2"] as const)("accepts a signed Notification (SignatureVersion %s)", async (v) => {
    stubCert();
    const msg = sign({ ...base, Type: "Notification", Message: '{"eventType":"Bounce"}', Subject: "hi" }, priv, v);
    expect(await verifySnsMessage(msg)).toBe(true);
  });

  it("accepts a Notification without Subject", async () => {
    stubCert();
    expect(await verifySnsMessage(sign({ ...base, Type: "Notification", Message: "x" }, priv, "2"))).toBe(true);
  });

  it.each(["1", "2"] as const)("accepts a signed SubscriptionConfirmation (SignatureVersion %s)", async (v) => {
    stubCert();
    const msg = sign(
      { ...base, Type: "SubscriptionConfirmation", Message: "confirm", SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription", Token: "tok" },
      priv,
      v,
    );
    expect(await verifySnsMessage(msg)).toBe(true);
  });

  it("rejects a tampered message", async () => {
    stubCert();
    const msg = sign({ ...base, Type: "Notification", Message: "original" }, priv, "2");
    expect(await verifySnsMessage({ ...msg, Message: "tampered" })).toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    stubCert();
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect(await verifySnsMessage(sign({ ...base, Type: "Notification", Message: "x" }, other, "2"))).toBe(false);
  });

  it.each([
    "https://sns.us-east-1.amazonaws.com.evil.com/x.pem",
    "https://evil.com/sns.us-east-1.amazonaws.com/x.pem",
    "https://sns.us-east-1.amazonaws.com@evil.com/x.pem",
    "https://sns.us-east-1.example.com/x.pem",
    "http://sns.us-east-1.amazonaws.com/x.pem",
    "not a url",
  ])("rejects SigningCertURL %s before any fetch", async (url) => {
    stubCert();
    const msg = { ...sign({ ...base, Type: "Notification", Message: "x" }, priv, "2"), SigningCertURL: url };
    expect(await verifySnsMessage(msg)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown SignatureVersion and a failed cert fetch", async () => {
    stubCert();
    const msg = sign({ ...base, Type: "Notification", Message: "x" }, priv, "2");
    expect(await verifySnsMessage({ ...msg, SignatureVersion: "3" })).toBe(false);
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await verifySnsMessage({ ...msg, SigningCertURL: "https://sns.eu-west-1.amazonaws.com/other.pem" })).toBe(false);
  });
});
