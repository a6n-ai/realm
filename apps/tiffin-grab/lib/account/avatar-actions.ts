"use server";

import { requireCustomer } from "@/lib/account/customer";
import { revalidateAccount } from "@/lib/account/revalidate";
import { filesService } from "@/lib/files";
import { usersService } from "@/lib/services/users.service";
import { sniffImageType, extFor, MAX_AVATAR_BYTES } from "@foundry/commons/util/image-sniff";
import { ownAvatarKey } from "@/lib/images/avatar-key";

// Avatars go through the shared file store (S3 in prod): Next never serves public/uploads after build and every deploy wipes it.
function forgetOld(url: string | null | undefined, userId: string) {
  const key = ownAvatarKey(url, userId);
  if (key) filesService().delete(key).catch(() => undefined);
}

export async function updateMyAvatar(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await requireCustomer().catch(() => null);
  if (!user) return { ok: false, error: "Not signed in" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, error: "Image must be 2 MB or smaller" };

  const type = sniffImageType(bytes);
  if (!type) return { ok: false, error: "Unsupported image type" };

  const current = await usersService.read(user.id);
  const oldImage = (current as { image?: string | null }).image;

  const name = `${user.id}-${crypto.randomUUID().slice(0, 8)}.${extFor(type)}`;
  const detail = await filesService().create(`avatars/${name}`, bytes, { contentType: type });
  if (!detail.url) return { ok: false, error: "Upload failed. Try again." };

  await usersService.updateProfile(user.id, { image: detail.url });
  forgetOld(oldImage, user.id);

  revalidateAccount();
  return { ok: true, url: detail.url };
}

export async function removeMyAvatar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireCustomer().catch(() => null);
  if (!user) return { ok: false, error: "Not signed in" };

  const current = await usersService.read(user.id);
  const oldImage = (current as { image?: string | null }).image;

  await usersService.updateProfile(user.id, { image: null });
  forgetOld(oldImage, user.id);

  revalidateAccount();
  return { ok: true };
}
