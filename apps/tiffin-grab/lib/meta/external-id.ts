/**
 * First-party id shared by the Pixel (`fbq('init', id, { external_id })`) and
 * Conversions API `user_data.external_id`. Meta hashes both sides and uses the
 * match as a dedupe key when event_id overlap is incomplete. The Pixel must
 * receive the raw value; the server hashes it in @foundry/meta-pixel.
 */
export const META_EXTERNAL_ID_COOKIE = "tg_mxid";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function metaExternalIdFromCookie(raw: string | null | undefined): string | undefined {
  const v = raw?.trim();
  return v && UUID_RE.test(v) ? v : undefined;
}

/** Cookie id when it is a UUID we minted; otherwise the caller's account id. */
export function dedupeExternalId(
  stored: string | null | undefined,
  fallback?: string | null,
): string | undefined {
  return metaExternalIdFromCookie(stored) ?? (fallback?.trim() || undefined);
}
