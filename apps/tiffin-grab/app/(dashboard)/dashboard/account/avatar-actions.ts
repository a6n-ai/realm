"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { filesService } from "@/lib/files";
import { usersService } from "@/lib/services/users.service";
import { sniffImageType, extFor, MAX_AVATAR_BYTES } from "@/lib/images/validate";

// Avatars go through the shared file store (S3 in prod), like dish photos. They
// used to be written into public/uploads/avatars on the container's disk, which
// Next never serves after build and every deploy wipes.
const FILES_BASE = `${(process.env.FILES_PUBLIC_BASE_URL ?? "/api/files").replace(/\/+$/, "")}/`;

/** Our stored key for an avatar URL; null for a Google photo or a legacy /uploads path. */
function storedKeyFrom(url: string | null | undefined): string | null {
  if (!url?.startsWith(FILES_BASE)) return null;
  return url.slice(FILES_BASE.length).split("?")[0] || null;
}

function forgetOld(url: string | null | undefined) {
  const key = storedKeyFrom(url);
  if (key) filesService().delete(key).catch(() => undefined);
}

function revalidateAccount() {
  revalidatePath("/dashboard/account");
  revalidatePath("/me/account");
}

export async function updateMyAvatar(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "Not signed in" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, error: "Image must be 2 MB or smaller" };

  const type = sniffImageType(bytes);
  if (!type) return { ok: false, error: "Unsupported image type" };

  const current = await usersService.read(session.user.id);
  const oldImage = (current as { image?: string | null }).image;

  const name = `${session.user.id}-${crypto.randomUUID().slice(0, 8)}.${extFor(type)}`;
  const detail = await filesService().create(`avatars/${name}`, bytes, { contentType: type });
  if (!detail.url) return { ok: false, error: "Upload failed. Try again." };

  await usersService.updateProfile(session.user.id, { image: detail.url });
  forgetOld(oldImage);

  revalidateAccount();
  return { ok: true, url: detail.url };
}

export async function removeMyAvatar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "Not signed in" };

  const current = await usersService.read(session.user.id);
  const oldImage = (current as { image?: string | null }).image;

  await usersService.updateProfile(session.user.id, { image: null });
  forgetOld(oldImage);

  revalidateAccount();
  return { ok: true };
}
