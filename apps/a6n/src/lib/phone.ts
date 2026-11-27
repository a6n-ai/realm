import { formatPhoneNumberIntl, parsePhoneNumber } from "react-phone-number-input";

export const DEFAULT_COUNTRY = "SG";

// Stored values are E.164, but older rows and other ingest sources hold free text; show those untouched.
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.startsWith("+") ? formatPhoneNumberIntl(phone) || phone : phone;
}

export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, "")}`;

// Turns a stored value (E.164 or a local format) into what the phone input can hold; "" when it cannot be read.
export function toInputValue(phone: string | null | undefined): string {
  if (!phone) return "";
  return parsePhoneNumber(phone, DEFAULT_COUNTRY)?.number ?? "";
}
