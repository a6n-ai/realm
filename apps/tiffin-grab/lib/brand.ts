export const BRAND_NAME = "Tiffin Grab";
export const BRAND_COMPACT = BRAND_NAME.replace(" ", "");
export const BRAND_HOST = "tiffingrab.ca";
export const SITE_URL = `https://${BRAND_HOST}`;

// Plain module, so server pages and the client chat button read the same strings: a constant exported from
// a "use client" file is a client reference on the server, not the value.
// Public support line (WhatsApp and phone).
export const SUPPORT_E164 = "16472449813";
const e = SUPPORT_E164;
export const CONTACT_PHONE = `+${e[0]} (${e.slice(1, 4)}) ${e.slice(4, 7)}-${e.slice(7)}`;
export const CONTACT_EMAIL = "info@tiffingrab.ca";
