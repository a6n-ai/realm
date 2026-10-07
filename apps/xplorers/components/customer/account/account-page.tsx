import Link from "next/link";
import { ArrowLeftIcon, ChevronRightIcon, LifeBuoyIcon, WalletIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { SignOutRow } from "./sign-out-row";
import { ProfileForm } from "./profile-form";
import { SecurityPanel } from "./security-panel";
import {
  ACCOUNT_SECTIONS,
  accountSectionHref,
  type AccountSection,
  type AccountSectionKey,
} from "./sections.config";

export type AccountUser = {
  name: string | null;
  email: string | null;
  image: string | null;
  displayUsername: string | null;
  passwordSet: boolean;
};

function SectionBody({
  k,
  user,
  google,
}: {
  k: AccountSectionKey;
  user: AccountUser;
  google: { connected: boolean } | null;
}) {
  switch (k) {
    case "profile":
      return (
        <ProfileForm
          image={user.image}
          name={user.name ?? ""}
          username={user.displayUsername ?? ""}
        />
      );
    case "security":
      return <SecurityPanel email={user.email} passwordSet={user.passwordSet} google={google} />;
    default: {
      const _exhaustive: never = k;
      return _exhaustive;
    }
  }
}

export function AccountPage({
  user,
  active,
  google = null,
}: {
  user: AccountUser;
  active: AccountSection | null;
  google?: { connected: boolean } | null;
}) {
  const shown = active ?? ACCOUNT_SECTIONS[0]!;
  const who = [user.name?.trim(), user.email].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className={cn(active && "hidden lg:block")}>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Account</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">{who || "Your settings"}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <div className={cn("space-y-6", active && "hidden lg:block")}>
          <nav aria-label="Account sections" className="space-y-4">
            <ul className="bg-card divide-border divide-y overflow-hidden rounded-[18px] border lg:hidden">
              {ACCOUNT_SECTIONS.map((s) => (
                <li key={s.key}>
                  <Link
                    href={accountSectionHref(s)}
                    scroll={false}
                    className="hover:bg-secondary/50 flex items-center gap-3 px-4 py-3.5 transition-colors active:scale-[0.995]"
                  >
                    <s.icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold tracking-tight">{s.label}</span>
                      <span className="text-muted-foreground block text-sm">{s.hint}</span>
                    </span>
                    <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>

            <ul className="hidden space-y-1 lg:block">
              {ACCOUNT_SECTIONS.map((s) => (
                <li key={s.key}>
                  <Link
                    href={accountSectionHref(s)}
                    scroll={false}
                    aria-current={s.key === shown.key ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-2xl px-4 text-sm font-semibold transition-colors",
                      s.key === shown.key
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-secondary/50",
                    )}
                  >
                    <s.icon aria-hidden className="size-[18px]" />
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-2">
            <ul className="bg-card divide-border divide-y overflow-hidden rounded-[18px] border">
              <li>
                <Link
                  href="/me/wallet"
                  className="hover:bg-secondary/50 flex items-center gap-3 px-4 py-3.5 transition-colors"
                >
                  <WalletIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold tracking-tight">Finances</span>
                    <span className="text-muted-foreground block text-sm">Coins, payments, history</span>
                  </span>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
              <li>
                <Link
                  href="/me/support"
                  className="hover:bg-secondary/50 flex items-center gap-3 px-4 py-3.5 transition-colors"
                >
                  <LifeBuoyIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold tracking-tight">Support</span>
                    <span className="text-muted-foreground block text-sm">Tickets and help</span>
                  </span>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            </ul>
            <div className="bg-card rounded-[18px] border p-3">
              <SignOutRow />
            </div>
          </div>
        </div>

        <section aria-label={shown.label} className={cn("min-w-0 max-w-2xl", !active && "hidden lg:block")}>
          {active ? (
            <Link
              href="/me/account"
              scroll={false}
              className="text-muted-foreground mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold lg:hidden"
            >
              <ArrowLeftIcon aria-hidden className="size-4" />
              Account
            </Link>
          ) : null}
          <SectionBody k={shown.key} user={user} google={google} />
        </section>
      </div>
    </div>
  );
}
