export interface SnsMessage {
  Type: string;
  MessageId: string;
  TopicArn?: string;
  Message: string;
  Subject?: string;
  Timestamp: string;
  Token?: string;
  SubscribeURL?: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
}

// Field order is fixed by the SNS signing spec.
const NOTIFICATION = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const;
const CONFIRMATION = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const;

const HOST = /^sns\.[a-z]{2}(-gov)?-[a-z]+-\d\.amazonaws\.com$/;
const CERT_PATH = /^\/SimpleNotificationService-[0-9a-f]+\.pem$/;
const MAX_CERTS = 16;
const certKeys = new Map<string, Promise<CryptoKey>>();

function certUrl(raw: unknown): URL | null {
  try {
    const u = new URL(String(raw));
    const plain =
      u.protocol === "https:" && !u.username && !u.password && !u.port && !u.search && !u.hash && HOST.test(u.hostname) && CERT_PATH.test(u.pathname);
    return plain ? u : null;
  } catch {
    return null;
  }
}

function canonical(msg: SnsMessage): string | null {
  let keys: readonly string[];
  if (msg.Type === "Notification") keys = NOTIFICATION;
  else if (msg.Type === "SubscriptionConfirmation" || msg.Type === "UnsubscribeConfirmation") keys = CONFIRMATION;
  else return null;
  const rec = msg as unknown as Record<string, string | undefined>;
  return keys.filter((k) => rec[k] !== undefined).map((k) => `${k}\n${rec[k]}\n`).join("");
}

const b64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Reads one DER element header at `at`: returns [contentStart, contentEnd].
function der(buf: Uint8Array, at: number): [number, number] {
  let p = at + 1;
  let n = buf[p++]!;
  if (n & 0x80) {
    const bytes = n & 0x7f;
    n = 0;
    for (let i = 0; i < bytes; i++) n = n * 256 + buf[p++]!;
  }
  return [p, p + n];
}

/** WebCrypto cannot import X.509; slice the SubjectPublicKeyInfo out of the certificate DER. */
function spkiOf(pem: string): Uint8Array<ArrayBuffer> {
  const buf = b64(pem.replace(/-----[^-]+-----|\s/g, ""));
  let [p] = der(buf, 0); // Certificate -> tbsCertificate
  [p] = der(buf, p);
  if (buf[p] === 0xa0) p = der(buf, p)[1]; // optional [0] version
  // serialNumber, signature, issuer, validity, subject
  for (let i = 0; i < 5; i++) p = der(buf, p)[1];
  return buf.slice(p, der(buf, p)[1]);
}

function importKey(url: URL, version: string): Promise<CryptoKey> {
  const id = `${version}|${url.origin}${url.pathname}`;
  let key = certKeys.get(id);
  if (!key) {
    key = (async () => {
      const res = await fetch(url, { redirect: "error" });
      if (!res.ok) throw new Error(`cert fetch ${res.status}`);
      const hash = version === "1" ? "SHA-1" : "SHA-256";
      return crypto.subtle.importKey("spki", spkiOf(await res.text()), { name: "RSASSA-PKCS1-v1_5", hash }, false, ["verify"]);
    })();
    if (certKeys.size >= MAX_CERTS) certKeys.delete(certKeys.keys().next().value!);
    certKeys.set(id, key);
    key.catch(() => certKeys.delete(id));
  }
  return key;
}

/** True only when the message was signed by an amazonaws.com SNS certificate. Never throws. */
export async function verifySnsMessage(msg: SnsMessage): Promise<boolean> {
  try {
    if (msg.SignatureVersion !== "1" && msg.SignatureVersion !== "2") return false;
    const url = certUrl(msg.SigningCertURL);
    const text = canonical(msg);
    if (!url || text === null || typeof msg.Signature !== "string") return false;
    const key = await importKey(url, msg.SignatureVersion);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64(msg.Signature), new TextEncoder().encode(text));
  } catch {
    return false;
  }
}
