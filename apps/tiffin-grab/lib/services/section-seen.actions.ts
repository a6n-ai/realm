"use server";

import { revalidatePath } from "next/cache";
import { markAllRead, markRead, type Section } from "./section-seen.service";

export async function markReadAction(section: Section): Promise<void> {
  await markRead(section);
}

export async function markAllReadAction(): Promise<void> {
  await markAllRead();
  revalidatePath("/dashboard", "layout");
}
