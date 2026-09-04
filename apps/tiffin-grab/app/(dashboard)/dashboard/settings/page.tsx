import Link from "next/link";
import {
  ArrowRightIcon,
  CreditCardIcon,
  HelpCircleIcon,
  PuzzleIcon,
  SettingsIcon,
  StarIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { getCloverConnection } from "@foundry/clover";
import { getGoogleReviewsConfig } from "@foundry/google-reviews";
import { PAYMENTS_PLUGIN_ID } from "@foundry/payments/plugin";
import { requireAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardHeader, PageHeader } from "@/components/ds";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { PLUGINS } from "@/lib/plugins.server";

type SettingsSection = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
};

export default async function SettingsPage() {
  await requireAdmin();
  const clover = await getCloverConnection(integrationsConfigStore);
  const paymentsStatus = await PLUGINS.find((p) => p.id === PAYMENTS_PLUGIN_ID)?.status();
  const googleReviews = await getGoogleReviewsConfig(integrationsConfigStore);

  const sections: SettingsSection[] = [
    {
      key: "general",
      label: "General",
      description: "Timezone and order cutoff settings.",
      icon: SettingsIcon,
      href: "/dashboard/settings/general",
    },
    {
      key: "lead-sources",
      label: "Lead sources",
      description: "Manage inbound and outbound lead sources.",
      icon: Webhook,
      href: "/dashboard/settings/lead-sources",
    },
    {
      key: "lead-assignment",
      label: "Lead assignment",
      description: "Routing strategy and pool membership.",
      icon: UsersIcon,
      href: "/dashboard/settings/lead-assignment",
    },
    {
      key: "meal-types",
      label: "Meal types",
      description: "Plan types, dish categories, and menu configuration.",
      icon: UtensilsCrossedIcon,
      href: "/dashboard/settings/meal-types",
    },
    {
      key: "public-website",
      label: "Public Website",
      description: "Content shown on the public site, like the FAQ.",
      icon: HelpCircleIcon,
      href: "/dashboard/settings/public-website",
    },
    {
      key: "integrations",
      label: "Integrations",
      description: "Install and remove plugins (Payments, Clover, and more).",
      icon: PuzzleIcon,
      href: "/dashboard/settings/integrations",
    },
  ];

  if (paymentsStatus?.installed) {
    sections.push({
      key: "payments",
      label: "Payment",
      description: "Configure installed payment providers — taxes, payee, and enablement.",
      icon: CreditCardIcon,
      href: "/dashboard/settings/payments",
    });
  }

  if (clover.installed) {
    sections.push({
      key: "clover",
      label: "Clover",
      description: "Merchant connection, reconnect, and disconnect.",
      icon: CreditCardIcon,
      href: "/dashboard/settings/clover",
    });
  }

  if (googleReviews.installed) {
    sections.push({
      key: "google-reviews",
      label: "Google Reviews",
      description: "Place ID and public review display.",
      icon: StarIcon,
      href: "/dashboard/settings/google-reviews",
    });
  }

  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Configure how the platform runs." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.key} href={s.href} className="group">
            <Card variant="lift" className="h-full">
              <CardHeader className="flex flex-row items-start justify-between">
                <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                  <s.icon className="size-5" />
                </span>
                <ArrowRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
              </CardHeader>
              <CardContent>
                <div className="font-medium">{s.label}</div>
                <div className="text-muted-foreground text-sm">{s.description}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
