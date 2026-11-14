import { revalidatePath } from "next/cache";

// Staff see the account at /dashboard/account, customers at /me/account; the same actions serve both.
export function revalidateAccount() {
  revalidatePath("/dashboard/account");
  revalidatePath("/me/account");
}
