"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { filesService } from "@/lib/files";
import { usersService } from "@/lib/services/users.service";
import { sniffImageType, extFor, MAX_AVATAR_BYTES } from "@/lib/images/validate";
import { ownAvatarKey } from "@/lib/images/avatar-key";

function forgetOld(url: string | null | undefined, userId: string) {
  const key = ownAvatarKey(url, userId);
  if (key) filesService().delete(key).catch(() => undefined);
}

function revalidateAccount() {
  revalidatePath("/me/account");
  revalidatePath("/me", "layout");
}

export async function updateMyAvatar(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session?.user?.id || session.user.role !== Role.USER) return { ok: false, error: "Not signed in" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, error: "Image must be 2 MB or smaller" };

  const type = sniffImageType(bytes);
  if (!type) return { ok: false, error: "Unsupported image type" };

  const current = await usersService.read(session.user.id);
  const oldImage = current.image;

  const name = `${session.user.id}-${crypto.randomUUID().slice(0, 8)}.${extFor(type)}`;
  const detail = await filesService().create(`avatars/${name}`, bytes, { contentType: type });
  if (!detail.url) return { ok: false, error: "Upload failed. Try again." };

  await usersService.updateProfile(session.user.id, { image: detail.url });
  forgetOld(oldImage, session.user.id);

  revalidateAccount();
  return { ok: true, url: detail.url };
}

export async function removeMyAvatar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session?.user?.id || session.user.role !== Role.USER) return { ok: false, error: "Not signed in" };

  const current = await usersService.read(session.user.id);
  const oldImage = current.image;

  await usersService.updateProfile(session.user.id, { image: null });
  forgetOld(oldImage, session.user.id);

  revalidateAccount();
  return { ok: true };
}
