import {
  InboxIcon,
  PaletteIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import {
  Card,
  CardContent,
  EmptyState,
  ListRow,
  PageHeader,
  PageShell,
  SectionCard,
  StageBadge,
  StatCard,
} from "@/components/ds";
import { InteractiveDemo } from "./interactive-demo";

export default async function DesignPage() {
  await requireAdmin();

  return (
    <PageShell>
      <PageHeader
        icon={PaletteIcon}
        title="Design system"
        subtitle="Shared components used across the dashboard"
      />

      <div className="space-y-8">
        <SectionCard title="Card variants" subtitle="glow (default), lift, flat">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card variant="glow">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">Glow card</p>
                <p className="text-muted-foreground text-xs">Default variant</p>
              </CardContent>
            </Card>
            <Card variant="lift">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">Lift card</p>
                <p className="text-muted-foreground text-xs">Hover to elevate</p>
              </CardContent>
            </Card>
            <Card variant="flat">
              <CardContent className="pt-6">
                <p className="text-sm font-medium">Flat card</p>
                <p className="text-muted-foreground text-xs">Border only</p>
              </CardContent>
            </Card>
          </div>
        </SectionCard>

        <SectionCard title="Stat cards" subtitle="Four stat cards — two with deltas">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total inquiries"
              value="248"
              icon={InboxIcon}
              delta={{ dir: "up", text: "+12% this week" }}
            />
            <StatCard
              label="Converted"
              value="64"
              icon={UsersIcon}
              delta={{ dir: "down", text: "−3% this week" }}
            />
            <StatCard
              label="Active menus"
              value="3"
              icon={UtensilsCrossedIcon}
            />
            <StatCard
              label="Dishes"
              value="42"
              icon={TrendingUpIcon}
            />
          </div>
        </SectionCard>

        <SectionCard title="Stage badges" subtitle="All five inquiry stages">
          <div className="flex flex-wrap gap-3">
            <StageBadge stage="new" />
            <StageBadge stage="contacted" />
            <StageBadge stage="follow_up" />
            <StageBadge stage="converted" />
            <StageBadge stage="lost" />
          </div>
        </SectionCard>

        <SectionCard title="List rows" subtitle="With avatar initials and a StageBadge trailing">
          <div className="space-y-2">
            <ListRow
              avatar="AK"
              title="Aarav Kumar"
              meta="aarav@example.com · 4 persons"
              trailing={<StageBadge stage="new" />}
            />
            <ListRow
              avatar="PR"
              title="Priya Reddy"
              meta="priya@example.com · 2 persons"
              trailing={<StageBadge stage="contacted" />}
            />
            <ListRow
              avatar="MS"
              title="Mihir Shah"
              meta="mihir@example.com · 6 persons"
              trailing={<StageBadge stage="follow_up" />}
            />
            <ListRow
              avatar="NP"
              title="Nisha Patel"
              meta="nisha@example.com · 3 persons"
              trailing={<StageBadge stage="converted" />}
            />
            <ListRow
              avatar="RV"
              title="Ravi Verma"
              meta="ravi@example.com · 5 persons"
              trailing={<StageBadge stage="lost" />}
            />
          </div>
        </SectionCard>

        <SectionCard title="Empty state" subtitle="Shown when a list has no items">
          <EmptyState
            icon={TrendingDownIcon}
            message="No results match the current filters. Try adjusting your search or clearing the active filters."
          />
        </SectionCard>

        <InteractiveDemo />
      </div>
    </PageShell>
  );
}
