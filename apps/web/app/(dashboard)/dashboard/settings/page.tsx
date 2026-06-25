import Link from "next/link";
import { ArrowRightIcon, SettingsIcon, UsersIcon, UtensilsCrossedIcon, Webhook, type LucideIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader, SectionCard, Card } from "@/components/ds";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ds";
import { getMealTypes } from "@/lib/services/app-settings.service";
import { MealTypesForm } from "./meal-types-form";

type SettingLink = { title: string; description: string; href: string; icon: LucideIcon };

const SETTINGS: SettingLink[] = [
  {
    title: "General",
    description: "App timezone and meal-selection cutoff.",
    href: "/dashboard/settings/general",
    icon: SettingsIcon,
  },
  {
    title: "Meal slots",
    description: "Enable or disable the meal slots offered in weekly menus.",
    href: "/dashboard/settings/meal-slots",
    icon: UtensilsCrossedIcon,
  },
  {
    title: "Lead sources",
    description: "Manage lead sources and their sub-sources.",
    href: "/dashboard/settings/lead-sources",
    icon: Webhook,
  },
  {
    title: "Lead assignment",
    description: "Routing strategy and per-source staff pools.",
    href: "/dashboard/settings/lead-assignment",
    icon: UsersIcon,
  },
];

export default async function SettingsPage() {
  await requireAdmin();
  const mealTypes = await getMealTypes();

  return (
    <PageShell>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Configure how the platform runs."
      />

      <SectionCard title="Platform">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SETTINGS.map((s) => (
            <Link key={s.href} href={s.href} className="group">
              <Card variant="lift" className="h-full">
                <CardHeader className="flex flex-row items-start justify-between">
                  <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                    <s.icon className="size-5" />
                  </span>
                  <ArrowRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  <CardDescription className="mt-1">{s.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Meal types &amp; slots"><MealTypesForm initial={mealTypes} /></SectionCard>
    </PageShell>
  );
}
