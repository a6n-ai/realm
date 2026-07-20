"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeftRightIcon,
  BellIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  ClipboardListIcon,
  FileTextIcon,
  LogOutIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  ReceiptIcon,
  SettingsIcon,
  ShieldIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@realm/ui/avatar";
import { Button } from "@realm/ui/button";
import { TransitionLink } from "@/components/motion/transition-link";

function initials(name: string | null, email: string): string {
  return (name?.trim() || email).slice(0, 2).toUpperCase();
}

function displayPhone(phone: string | null | undefined, email: string): string {
  if (phone?.trim()) return phone.trim();
  return email;
}

type QuickAction = {
  href: string;
  label: string;
  icon: typeof CalendarDaysIcon;
};

type MenuItem = {
  href: string;
  label: string;
  icon: typeof CircleHelpIcon;
};

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/me/deliveries", label: "My deliveries", icon: CalendarDaysIcon },
  { href: "/me/wallet?tab=transactions", label: "Transactions", icon: ArrowLeftRightIcon },
  { href: "/me/wallet?tab=bills", label: "Monthly bills", icon: ReceiptIcon },
];

const SETTINGS_ITEMS: MenuItem[] = [
  { href: "/me/profile", label: "Profile", icon: SettingsIcon },
  { href: "/me/contact", label: "Contact", icon: PhoneIcon },
  { href: "/me/address", label: "Delivery address", icon: MapPinIcon },
  { href: "/me/dietary", label: "Dietary & allergens", icon: UtensilsCrossedIcon },
  { href: "/me/delivery-notes", label: "Delivery notes", icon: ClipboardListIcon },
  { href: "/me/notifications", label: "Notifications", icon: BellIcon },
  { href: "/me/security", label: "Security", icon: ShieldIcon },
];

const SUPPORT_ITEMS: MenuItem[] = [
  { href: "/faq", label: "FAQs", icon: CircleHelpIcon },
  { href: "/contact", label: "Contact us", icon: MailIcon },
  { href: "/me/meals", label: "Delivery preferences", icon: UtensilsCrossedIcon },
  { href: "/privacy", label: "Privacy policy", icon: FileTextIcon },
];

export function CustomerAccountHub({
  user,
}: {
  user: {
    name: string | null;
    email: string;
    phone: string | null;
    image: string | null;
  };
}) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <div className="-mx-4 -mt-6 md:-mx-6 md:-mt-8">
      <section className="bg-primary text-primary-foreground px-4 pb-16 pt-6 md:px-6 md:pb-20 md:pt-8">
        <div className="flex items-start gap-3">
          <Avatar className="size-14 border-2 border-primary-foreground/20 bg-primary-foreground/10">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} />
            <AvatarFallback className="bg-primary-foreground/15 text-base text-primary-foreground">
              {initials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{user.name?.trim() || "Your account"}</p>
            <p className="text-primary-foreground/85 truncate text-sm tabular-nums">
              {displayPhone(user.phone, user.email)}
            </p>
          </div>
          <Button
            asChild
            variant="secondary"
            size="sm"
            className="shrink-0 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
          >
            <TransitionLink href="/me/profile">Edit profile</TransitionLink>
          </Button>
        </div>
      </section>

      <section className="relative z-10 -mt-10 px-4 md:px-6">
        <div className="grid grid-cols-3 gap-2.5">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <TransitionLink
              key={href}
              href={href}
              className="bg-card flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-full">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-xs font-medium leading-tight">{label}</span>
            </TransitionLink>
          ))}
        </div>
      </section>

      <section className="mt-5 space-y-5 px-4 pb-8 md:px-6">
        <div>
          <p className="text-muted-foreground mb-2 px-1 text-xs font-medium tracking-wide uppercase">Settings</p>
          <ul className="bg-card divide-y overflow-hidden rounded-xl border">
            {SETTINGS_ITEMS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <TransitionLink
                  href={href}
                  className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                >
                  <Icon className="text-primary size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{label}</span>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </TransitionLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-muted-foreground mb-2 px-1 text-xs font-medium tracking-wide uppercase">Support</p>
          <ul className="bg-card divide-y overflow-hidden rounded-xl border">
            {SUPPORT_ITEMS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <TransitionLink
                  href={href}
                  className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent/50"
                >
                  <Icon className="text-primary size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{label}</span>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </TransitionLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-bad flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <LogOutIcon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">Sign out</span>
              </button>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
