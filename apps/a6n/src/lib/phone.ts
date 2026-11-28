import { formatPhoneNumberIntl, parsePhoneNumber } from "react-phone-number-input";

export const DEFAULT_COUNTRY = "SG";

// Stored values are E.164, but older rows and other ingest sources hold local formats: read those as DEFAULT_COUNTRY
// numbers so every row shows its +code; text that is not a valid number is shown untouched.
const parsed = (phone: string) => {
  try {
    const p = parsePhoneNumber(phone, DEFAULT_COUNTRY);
    return p?.isValid() ? p : undefined;
  } catch {
    return undefined;
  }
};

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const p = parsed(phone);
  return p ? formatPhoneNumberIntl(p.number) || p.number : phone;
}

// The number's country as a flag emoji ("" when unknown), from its two-letter region code.
export function phoneFlag(phone: string | null | undefined): string {
  const country = phone ? parsed(phone)?.country : undefined;
  return country ? String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "";
}

// What gets stored: E.164 when the number parses (local numbers as DEFAULT_COUNTRY), else the trimmed text as given.
export function toE164(phone: string | null | undefined): string | null {
  const t = phone?.trim();
  if (!t) return null;
  return parsed(t)?.number ?? t;
}

export const telHref = (phone: string): string => `tel:${parsed(phone)?.number ?? phone.replace(/[^\d+]/g, "")}`;

// Turns a stored value (E.164 or a local format) into what the phone input can hold; "" when it cannot be read.
export function toInputValue(phone: string | null | undefined): string {
  if (!phone) return "";
  return parsePhoneNumber(phone, DEFAULT_COUNTRY)?.number ?? "";
}
