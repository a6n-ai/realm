import {
  hashMetaField,
  normalizeCity,
  normalizeEmail,
  normalizePhone,
  normalizePostal,
  normalizeProvince,
  splitPersonName,
} from "./hash";
import type { MetaUserDataInput } from "./types";

type MetaUserData = Record<string, string | string[]>;

/** Meta CAPI `user_data` — only keys with values; PII hashed per Meta rules. */
export function buildMetaUserData(input: MetaUserDataInput): MetaUserData {
  const { fn, ln } = splitPersonName(input.fullName);
  const out: MetaUserData = {};

  const em = hashMetaField(normalizeEmail(input.email));
  if (em) out.em = [em];

  const ph = hashMetaField(normalizePhone(input.phone));
  if (ph) out.ph = [ph];

  const fnH = hashMetaField(fn);
  if (fnH) out.fn = [fnH];

  const lnH = hashMetaField(ln);
  if (lnH) out.ln = [lnH];

  const ct = hashMetaField(normalizeCity(input.city));
  if (ct) out.ct = [ct];

  const st = hashMetaField(normalizeProvince(input.province));
  if (st) out.st = [st];

  const zp = hashMetaField(normalizePostal(input.postalCode));
  if (zp) out.zp = [zp];

  const country = hashMetaField(input.country?.trim().toLowerCase());
  if (country) out.country = [country];

  const externalId = input.externalId?.trim();
  if (externalId) {
    const ext = hashMetaField(externalId);
    if (ext) out.external_id = [ext];
  }

  const ip = input.clientIpAddress?.trim();
  if (ip) out.client_ip_address = ip;

  const ua = input.clientUserAgent?.trim();
  if (ua) out.client_user_agent = ua;

  const fbp = input.fbp?.trim();
  if (fbp) out.fbp = fbp;

  const fbc = input.fbc?.trim();
  if (fbc) out.fbc = fbc;

  return out;
}
