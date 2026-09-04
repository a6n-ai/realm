import Link from "next/link";
import { ArrowRightIcon, HelpCircleIcon } from "lucide-react";
import { Card, CardContent, CardHeader, PageHeader, PageShell } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";

// One content type today (FAQ); more public-site content (hours, about copy,
// etc.) graduates in here as its own card once it needs admin editing too —
// see docs/superpowers/plans for the discussion that led to this page.
export default async function PublicWebsitePage() {
  await requirePermission({ settings: ["read"] });

  return (
    <PageShell>
      <PageHeader
        icon={HelpCircleIcon}
        title="Public Website"
        subtitle="Content shown on the public site, editable without a deploy."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/settings/public-website/faq" className="group">
          <Card variant="lift" className="h-full">
            <CardHeader className="flex flex-row items-start justify-between">
              <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
                <HelpCircleIcon className="size-5" />
              </span>
              <ArrowRightIcon className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
            </CardHeader>
            <CardContent>
              <div className="font-medium">FAQ</div>
              <div className="text-muted-foreground text-sm">Questions and answers shown on /faq and the home page.</div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </PageShell>
  );
}
