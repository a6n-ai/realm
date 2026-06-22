"use server";

import { revalidatePath } from "next/cache";
import { AuthError } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";

export async function updateMyContact(input: { phone?: string; email?: string }) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  await usersService.updateContact(session.user.id, input);
  revalidatePath("/dashboard/account");
}
