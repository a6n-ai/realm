import { Avatar, AvatarFallback, AvatarImage } from "@realm/ui/avatar";
import { TransitionLink } from "@/components/motion/transition-link";

function initials(name: string | null, email: string): string {
  return (name?.trim() || email).slice(0, 2).toUpperCase();
}

export function CustomerProfileMenu({
  user,
}: {
  user: { name: string | null; email: string; image: string | null };
}) {
  return (
    <TransitionLink href="/me/account" aria-label="Account">
      <Avatar className="size-8">
        <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} />
        <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
      </Avatar>
    </TransitionLink>
  );
}
