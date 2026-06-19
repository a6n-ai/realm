import Link from "next/link";
import { ArrowRightIcon, UtensilsCrossedIcon, type LucideIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SettingLink = { title: string; description: string; href: string; icon: LucideIcon };

const SETTINGS: SettingLink[] = [
  {
    title: "Meal slots",
    description: "Enable or disable the meal slots offered in weekly menus.",
    href: "/dashboard/settings/meal-slots",
    icon: UtensilsCrossedIcon,
  },
];

export default async function SettingsPage() {
  await requireAdmin();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="gradient-text text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">Configure how the platform runs.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SETTINGS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <Card className="card-glow hover-lift h-full">
              <CardHeader className="flex flex-row items-start justify-between">
                <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                  <s.icon className="icon-pop size-5" />
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
    </section>
  );
}
