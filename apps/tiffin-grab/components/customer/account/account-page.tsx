import Link from "next/link";
import { ChevronLeft, ChevronRight, LifeBuoy, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Role, type RoleValue } from "@foundry/commons";
import { IconTile, ListGroup, PageHeader, type IconTint } from "@/components/customer/kit";
import { Avatar } from "./avatar";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { SignOutRow } from "./sign-out-row";
import type { SavedAddress } from "@foundry/address";
import { AddressBook } from "./address-book";
import { SavedCards, type SavedCardView } from "./saved-cards";
import type { DropOffCatalog, DropOffValue } from "@/lib/catalog/drop-off";
import { ContactForm, DietaryForm, NotificationsForm, ProfileForm, SecurityPanel } from "./forms";
import { accountSectionHref, sectionsForRole, type AccountSection, type AccountSectionKey } from "./sections.config";

export type AccountUser = {
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  username: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  addressLine: string;
  addressUnit: string;
  city: string;
  postalCode: string;
  province: string;
  dietaryNotes: string;
  allergens: string[];
  notifyEmail: boolean;
  notifySms: boolean;
  hasPin: boolean;
};

function SectionBody({ k, user, role, addresses, cards, dropOff, dropOffs, google }: { k: AccountSectionKey; cards: SavedCardView[]; user: AccountUser; role: RoleValue; addresses: SavedAddress[]; dropOff?: DropOffCatalog; dropOffs: Record<string, DropOffValue>; google: { connected: boolean } | null }) {
  switch (k) {
    case "profile":
      return <ProfileForm image={user.image} name={user.name ?? ""} username={user.username ?? ""} />;
    case "contact":
      return <ContactForm phone={user.phone ?? ""} email={user.email} emailVerified={user.emailVerified} phoneVerified={user.phoneVerified} />;
    case "address":
      return <AddressBook initial={addresses} dropOff={dropOff} initialDropOffs={dropOffs} />;
    case "payment-methods":
      return <SavedCards cards={cards} />;
    case "dietary":
      return <DietaryForm allergens={user.allergens} dietaryNotes={user.dietaryNotes} />;
    case "notifications":
      return <NotificationsForm notifyEmail={user.notifyEmail} />;
    case "security":
      return <SecurityPanel email={user.email} staffPin={role === Role.USER ? null : { hasPin: user.hasPin }} google={google} />;
  }
}

const TILE: Record<string, IconTint> = {
  profile: "blue",
  security: "green",
  contact: "teal",
  "payment-methods": "indigo",
  address: "orange",
  dietary: "pink",
  notifications: "red",
  support: "purple",
  finances: "mint",
};

const CURRENT = "lg:bg-[color-mix(in_oklch,var(--foreground)_8%,transparent)]";

const rowBase = "flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[15px] transition-colors active:bg-[var(--muted)]";

function Tile({ k, children }: { k: string; children: ReactNode }) {
  return <IconTile tint={TILE[k]}>{children}</IconTile>;
}

function GroupHeader({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{children}</p>;
}

function GroupFooter({ children }: { children: ReactNode }) {
  return <p className="px-4 pt-2 text-[13px] text-[var(--muted-foreground)]">{children}</p>;
}

function SectionRow({ s, current }: { s: AccountSection; current: boolean }) {
  return (
    <Link
      href={accountSectionHref(s)}
      scroll={false}
      aria-current={current ? "page" : undefined}
      className={cn(FONT, FOCUS, rowBase, "font-semibold", current && CURRENT)}
    >
      <Tile k={s.key}><s.icon className="size-[18px]" /></Tile>
      <span className="min-w-0 flex-1">
        <span className="block">{s.label}</span>
        <span className="block text-[13px] font-normal text-[var(--muted-foreground)] lg:hidden">{s.hint}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
    </Link>
  );
}

function AccountRow({ user, profile, current }: { user: AccountUser; profile: AccountSection | undefined; current: boolean }) {
  const body = (
    <>
      <Avatar name={user.name} image={user.image} className="size-14 text-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-semibold">{user.name?.trim() || "Your account"}</span>
        <span className="block truncate text-[13px] font-normal text-[var(--muted-foreground)]">{user.email}</span>
      </span>
      {profile && <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />}
    </>
  );
  const cls = cn(FONT, rowBase, "min-h-[4.5rem] py-3", current && CURRENT);
  return profile ? (
    <Link href={accountSectionHref(profile)} scroll={false} aria-current={current ? "page" : undefined} aria-label={`${user.name?.trim() || "Profile"}, ${user.email}. Profile`} className={cn(FOCUS, cls)}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function AccountPage({
  user,
  role,
  active,
  addresses = [],
  cardsOn = false,
  cards = [],
  dropOff,
  dropOffs = {},
  google = null,
}: {
  user: AccountUser;
  role: RoleValue;
  active: AccountSection | null;
  /** Saved delivery addresses (customers only). */
  addresses?: SavedAddress[];
  /** Stripe is connected: the Payment methods section exists. */
  cardsOn?: boolean;
  cards?: SavedCardView[];
  /** Admin delivery strategies offered as each address's drop-off. */
  dropOff?: DropOffCatalog;
  /** Address public id → its drop-off's strategy public id. */
  dropOffs?: Record<string, DropOffValue>;
  /** Google sign-in link state; null when Google is off or another section is open. */
  google?: { connected: boolean } | null;
}) {
  const sections = sectionsForRole(role, { cards: cardsOn });
  const shown = active ?? sections[0];
  const profile = sections.find((s) => s.key === "profile");
  const pick = (keys: AccountSectionKey[]) => sections.filter((s) => keys.includes(s.key));
  const groups = [
    { header: "Account", rows: pick(["security", "contact", "payment-methods"]), footer: undefined },
    // The allergens note belongs to the Dietary row, so it only shows when that row does.
    { header: "Preferences", rows: pick(["address", "dietary", "notifications"]), footer: sections.some((s) => s.key === "dietary") ? "Allergens are flagged on every order." : undefined },
  ].filter((g) => g.rows.length > 0);
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className={cn(active && "hidden lg:block")}>
        <PageHeader eyebrow="Account" title="Your" accent="account" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Account sections" className={cn("space-y-6", active && "hidden lg:block")}>
          <ListGroup>
            <AccountRow user={user} profile={profile} current={shown.key === "profile"} />
          </ListGroup>
          {groups.map((g) => (
            <div key={g.header}>
              <GroupHeader>{g.header}</GroupHeader>
              <ListGroup>
                {g.rows.map((s) => <SectionRow key={s.key} s={s} current={s.key === shown.key} />)}
              </ListGroup>
              {g.footer && <GroupFooter>{g.footer}</GroupFooter>}
            </div>
          ))}
          {/* Finances lives in the header coin pill too; Settings lists it so it's found where accounts usually keep money. */}
          <div>
            <GroupHeader>Money</GroupHeader>
            <ListGroup>
              <Link href="/me/wallet" className={cn(FONT, FOCUS, rowBase, "font-semibold")}>
                <Tile k="finances"><Wallet className="size-[18px]" /></Tile>
                <span className="min-w-0 flex-1">
                  <span className="block">Finances</span>
                  <span className="block text-[13px] font-normal text-[var(--muted-foreground)] lg:hidden">Coins, coupons, bills</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
              </Link>
            </ListGroup>
          </div>
          <div>
            <GroupHeader>Help</GroupHeader>
            <ListGroup>
              <Link href="/me/support" className={cn(FONT, FOCUS, rowBase, "font-semibold")}>
                <Tile k="support"><LifeBuoy className="size-[18px]" /></Tile>
                <span className="min-w-0 flex-1">
                  <span className="block">Need help? Support</span>
                  <span className="block text-[13px] font-normal text-[var(--muted-foreground)] lg:hidden">Ask us anything</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
              </Link>
            </ListGroup>
          </div>
          <ListGroup>
            <SignOutRow />
          </ListGroup>
        </nav>

        <section
          aria-label={shown.label}
          className={cn("min-w-0 max-w-2xl", !active && "hidden lg:block", active && "animate-in fade-in slide-in-from-right-6 duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none lg:animate-none")}
        >
          {active && (
            <div className="relative mb-4 flex min-h-11 items-center justify-center lg:hidden">
              <Link href="/me/account" scroll={false} className={cn(FONT, FOCUS, "absolute left-0 inline-flex min-h-11 items-center gap-0.5 text-[15px] font-semibold text-[var(--primary)]")}>
                <ChevronLeft aria-hidden className="size-5" />
                Account
              </Link>
              <p aria-hidden className="text-[15px] font-semibold">{shown.label}</p>
            </div>
          )}
          <SectionBody k={shown.key} user={user} role={role} addresses={addresses} cards={cards} dropOff={dropOff} dropOffs={dropOffs} google={google} />
        </section>
      </div>
    </div>
  );
}
