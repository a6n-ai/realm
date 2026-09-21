import Link from "next/link";
import {
  ArrowRightIcon,
  BanknoteIcon,
  PuzzleIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, PageHeader } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";

type SettingsSection = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
};

export default async function SettingsPage() {
  await requireAdmin();

  const sections: SettingsSection[] = [
    {
      key: "general",
      label: "General",
      description: "Timezone and currency used across the app.",
      icon: SettingsIcon,
      href: "/dashboard/settings/general",
    },
    {
      key: "users",
      label: "Users",
      description: "Invite staff and manage accounts.",
      icon: UsersIcon,
      href: "/dashboard/settings/users",
    },
    {
      key: "integrations",
      label: "Integrations",
      description: "Activate Payments to collect booking fees.",
      icon: PuzzleIcon,
      href: "/dashboard/settings/integrations",
    },
    {
      key: "payments",
      label: "Payment",
      description: "Cash on delivery is on by default. Add e-Transfer when you need it.",
      icon: BanknoteIcon,
      href: "/dashboard/settings/payments",
    },
  ];

  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Configure how the studio runs." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.key} href={s.href} className="group" prefetch={false}>
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
