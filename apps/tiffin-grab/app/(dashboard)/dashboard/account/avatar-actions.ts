"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { storage } from "@/lib/storage";
import { usersService } from "@/lib/services/users.service";
import { sniffImageType, extFor, MAX_AVATAR_BYTES } from "@/lib/images/validate";

const AVATAR_URL_PREFIX = "/uploads/avatars/";

function oldKeyFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(AVATAR_URL_PREFIX)) return null;
  return url.slice(AVATAR_URL_PREFIX.length);
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

  const key = `${session.user.id}-${crypto.randomUUID().slice(0, 8)}.${extFor(type)}`;
  const url = await storage.put(key, bytes, type);

  await usersService.updateProfile(session.user.id, { image: url });

  const oldKey = oldKeyFrom(oldImage);
  if (oldKey) {
    storage.delete(oldKey).catch(() => undefined);
  }

  revalidatePath("/dashboard/account");
  return { ok: true, url };
}

export async function removeMyAvatar(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, error: "Not signed in" };

  const current = await usersService.read(session.user.id);
  const oldImage = (current as { image?: string | null }).image;

  await usersService.updateProfile(session.user.id, { image: null });

  const oldKey = oldKeyFrom(oldImage);
  if (oldKey) {
    storage.delete(oldKey).catch(() => undefined);
  }

  revalidatePath("/dashboard/account");
  return { ok: true };
}
