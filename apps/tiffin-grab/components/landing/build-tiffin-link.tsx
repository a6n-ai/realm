import Link from "next/link";
import type { ComponentProps } from "react";

/** "Build my tiffin". A plain link: /subscribe already sends a signed-in visitor on server-side
 *  (staff to /dashboard, customers to their new-order stepper). Checking the session here meant a
 *  client useSession() fetch to /api/auth/get-session on every public page view (~480 ms Worker CPU each). */
export function BuildTiffinLink({ href = "/subscribe", ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href?: string }) {
  return <Link prefetch={false} {...props} href={href} />;
}
