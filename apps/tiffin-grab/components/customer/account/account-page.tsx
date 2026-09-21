import Link from "next/link";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { Role, type RoleValue } from "@foundry/commons";
import { ListGroup, ListRow, PageHeader } from "@/components/customer/kit";
import { cn, FOCUS } from "@/components/customer/kit/cn";
import { SignOutRow } from "./sign-out-row";
import { AddressForm, ContactForm, DeliveryNotesForm, DietaryForm, NotificationsForm, ProfileForm, SecurityPanel } from "./forms";
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
  deliveryNotes: string;
  notifyEmail: boolean;
  notifySms: boolean;
  hasPin: boolean;
};

function SectionBody({ k, user, role }: { k: AccountSectionKey; user: AccountUser; role: RoleValue }) {
  switch (k) {
    case "profile":
      return <ProfileForm image={user.image} name={user.name ?? ""} username={user.username ?? ""} />;
    case "contact":
      return <ContactForm phone={user.phone ?? ""} email={user.email} emailVerified={user.emailVerified} phoneVerified={user.phoneVerified} />;
    case "address":
      return <AddressForm addressLine={user.addressLine} addressUnit={user.addressUnit} city={user.city} postalCode={user.postalCode} province={user.province} />;
    case "dietary":
      return <DietaryForm allergens={user.allergens} dietaryNotes={user.dietaryNotes} />;
    case "deliveryNotes":
      return <DeliveryNotesForm deliveryNotes={user.deliveryNotes} />;
    case "notifications":
      return <NotificationsForm notifyEmail={user.notifyEmail} notifySms={user.notifySms} />;
    case "security":
      return <SecurityPanel email={user.email} staffPin={role === Role.USER ? null : { hasPin: user.hasPin }} />;
  }
}

export function AccountPage({ user, role, active }: { user: AccountUser; role: RoleValue; active: AccountSection | null }) {
  const sections = sectionsForRole(role);
  const shown = active ?? sections[0];
  const who = [user.name?.trim(), user.email].filter(Boolean).join(" · ");
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className={cn(active && "hidden lg:block")}>
        <PageHeader eyebrow="Account" title="Your" accent="account" subtitle={who} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
        <div className={cn("space-y-6", active && "hidden lg:block")}>
          <nav aria-label="Account sections" className="space-y-6">
            <ListGroup>
              {sections.map((s) => (
                <ListRow
                  key={s.key}
                  href={accountSectionHref(s)}
                  icon={<s.icon className="size-[18px]" />}
                  label={s.label}
                  sublabel={s.hint}
                  className={cn("lg:hidden")}
                />
              ))}
            </ListGroup>
            <ul className="hidden space-y-1 lg:block">
              {sections.map((s) => (
                <li key={s.key}>
                  <Link
                    href={accountSectionHref(s)}
                    scroll={false}
                    aria-current={s.key === shown.key ? "page" : undefined}
                    className={cn(
                      FOCUS,
                      "flex min-h-11 items-center gap-3 rounded-2xl px-4 text-[15px] font-semibold",
                      s.key === shown.key ? "bg-[var(--primary-wash,#FBE3D2)] text-[#B5430B] dark:text-[#FFB877]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
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
            <ListGroup>
              <ListRow href="/me/support" icon={<LifeBuoy className="size-[18px]" />} label="Need help? Support" sublabel="Ask us anything" />
            </ListGroup>
            <SignOutRow />
          </div>
        </div>

        <section aria-label={shown.label} className={cn("min-w-0 max-w-2xl", !active && "hidden lg:block")}>
          {active && (
            <Link href="/me/account" scroll={false} className={cn(FOCUS, "mb-4 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-[var(--muted-foreground)] lg:hidden")}>
              <ArrowLeft aria-hidden className="size-4" />
              Account
            </Link>
          )}
          <SectionBody k={shown.key} user={user} role={role} />
        </section>
      </div>
    </div>
  );
}
