const FILES_BASE = `${(process.env.FILES_PUBLIC_BASE_URL ?? "/api/files").replace(/\/+$/, "")}/`;

/**
 * The stored key of THIS user's own uploaded avatar, else null (a Google photo
 * or anything else). Only a key of the shape updateMyAvatar writes for this user
 * may be deleted.
 */
export function ownAvatarKey(url: string | null | undefined, userId: string, base: string = FILES_BASE): string | null {
  if (!url?.startsWith(base)) return null;
  const key = url.slice(base.length);
  const own = new RegExp(`^public/avatars/${userId.replace(/[^\w-]/g, "")}-[0-9a-f]{8}\\.(png|jpe?g|webp)$`);
  return own.test(key) ? key : null;
}
