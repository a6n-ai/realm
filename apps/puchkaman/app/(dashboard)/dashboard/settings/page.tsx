import Link from "next/link";
import {
  ArrowRightIcon,
  CreditCardIcon,
  PuzzleIcon,
  SettingsIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { getCloverConnection } from "@realm/clover";
import { Card, CardContent, CardHeader, PageHeader, PageShell } from "@realm/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

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

  const sections: SettingsSection[] = [
    {
      key: "integrations",
      label: "Integrations",
      description: "Install and remove plugins (Clover and more).",
      icon: PuzzleIcon,
      href: "/dashboard/settings/integrations",
    },
  ];

  // Parallel to Payment tabs: show Clover settings only after the plugin is installed.
  if (clover.installed) {
    sections.push({
      key: "clover",
      label: "Clover",
      description: "Merchant connection, reconnect, and disconnect.",
      icon: CreditCardIcon,
      href: "/dashboard/settings/clover",
    });
  }

  sections.push({
    key: "account",
    label: "Account",
    description: "Profile, email, and password.",
    icon: UserIcon,
    href: "/dashboard/account",
  });

  return (
    <PageShell>
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
    </PageShell>
  );
}
