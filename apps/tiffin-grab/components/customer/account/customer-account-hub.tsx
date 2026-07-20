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
  LifeBuoyIcon,
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
import { PageShell } from "@/components/ds";
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
  { href: "/me/support", label: "Support tickets", icon: LifeBuoyIcon },
  { href: "/faq", label: "FAQs", icon: CircleHelpIcon },
  { href: "/contact", label: "Contact us", icon: MailIcon },
  { href: "/me/meals", label: "Delivery preferences", icon: UtensilsCrossedIcon },
  { href: "/privacy", label: "Privacy policy", icon: FileTextIcon },
];

function MenuList({
  items,
  onSignOut,
}: {
  items: MenuItem[];
  onSignOut?: () => void;
}) {
  return (
    <ul className="bg-card divide-y overflow-hidden rounded-xl border">
      {items.map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <TransitionLink
            href={href}
            className="hover:bg-accent/50 flex min-h-12 items-center gap-3 px-4 py-3 text-sm transition-colors"
          >
            <Icon className="text-primary size-4 shrink-0" aria-hidden />
            <span className="flex-1">{label}</span>
            <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </TransitionLink>
        </li>
      ))}
      {onSignOut ? (
        <li>
          <button
            type="button"
            onClick={onSignOut}
            className="text-bad hover:bg-accent/50 flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors"
          >
            <LogOutIcon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">Sign out</span>
          </button>
        </li>
      ) : null}
    </ul>
  );
}

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
    <>
      {/* Mobile: full-bleed phone hub (cancels CrmShell p-6) */}
      <div className="-mx-6 -mt-6 md:hidden">
        <section className="bg-primary text-primary-foreground px-4 pb-16 pt-6">
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
              className="bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25 shrink-0"
            >
              <TransitionLink href="/me/profile">Edit profile</TransitionLink>
            </Button>
          </div>
        </section>

        <section className="relative z-10 -mt-10 px-4">
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

        <section className="mt-5 space-y-5 px-4 pb-8">
          <div>
            <header className="mb-2 space-y-0.5 px-1">
              <h2 className="text-sm font-semibold tracking-tight">Settings</h2>
              <p className="text-muted-foreground text-xs text-pretty">
                Profile, delivery details, and security.
              </p>
            </header>
            <MenuList items={SETTINGS_ITEMS} />
          </div>
          <div>
            <header className="mb-2 space-y-0.5 px-1">
              <h2 className="text-sm font-semibold tracking-tight">Support</h2>
              <p className="text-muted-foreground text-xs text-pretty">
                Help, policies, and meal preferences.
              </p>
            </header>
            <MenuList items={SUPPORT_ITEMS} onSignOut={handleSignOut} />
          </div>
        </section>
      </div>

      {/* Desktop: contained two-column account overview */}
      <div className="hidden md:block">
        <PageShell>
          <header className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar className="size-16 border bg-muted">
                <AvatarImage src={user.image ?? undefined} alt={user.name ?? user.email} />
                <AvatarFallback className="text-lg">{initials(user.name, user.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-balance">
                  {user.name?.trim() || "Your account"}
                </h1>
                <p className="text-muted-foreground truncate text-sm tabular-nums">
                  {displayPhone(user.phone, user.email)}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <TransitionLink href="/me/profile">Edit profile</TransitionLink>
            </Button>
          </header>

          <section className="grid grid-cols-3 gap-3">
            {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
              <TransitionLink
                key={href}
                href={href}
                className="bg-card hover:bg-accent/40 flex items-center gap-3 rounded-xl border px-4 py-4 transition-colors active:scale-[0.98]"
              >
                <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-full">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </TransitionLink>
            ))}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <header className="mb-2 space-y-0.5 md:mb-3 md:space-y-1">
                <h2 className="text-base font-semibold tracking-tight md:text-lg">Settings</h2>
                <p className="text-muted-foreground text-sm text-pretty">
                  Profile, delivery details, and security.
                </p>
              </header>
              <MenuList items={SETTINGS_ITEMS} />
            </div>
            <div>
              <header className="mb-2 space-y-0.5 md:mb-3 md:space-y-1">
                <h2 className="text-base font-semibold tracking-tight md:text-lg">Support</h2>
                <p className="text-muted-foreground text-sm text-pretty">
                  Help, policies, and meal preferences.
                </p>
              </header>
              <MenuList items={SUPPORT_ITEMS} onSignOut={handleSignOut} />
            </div>
          </div>
        </PageShell>
      </div>
    </>
  );
}
