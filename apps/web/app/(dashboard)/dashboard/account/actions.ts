"use server";

import { revalidatePath } from "next/cache";
import { AuthError } from "@tiffin/commons";
import { auth } from "@/lib/auth";
import { usersService } from "@/lib/services/users.service";

export async function updateMyContact(input: { phone?: string; email?: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError();
  await usersService.updateContact(session.user.id, input);
  revalidatePath("/dashboard/account");
}
