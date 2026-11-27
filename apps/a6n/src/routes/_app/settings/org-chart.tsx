import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { OrgChart } from "../../../components/team/org-chart";
import { OrgChartSkeleton } from "../../../components/page/skeletons";
import { SettingsCard } from "../../../components/page/settings-card";
import { errorText } from "../../../lib/error-copy";
import { orgChartFn } from "../../../lib/team/team.fns";

export const Route = createFileRoute("/_app/settings/org-chart")({
  loader: () => orgChartFn(),
  pendingComponent: OrgChartSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />;
  },
  component: OrgChartPage,
});

function OrgChartPage() {
  const people = Route.useLoaderData();
  if (!people) return <DeniedState />;
  return (
    <SettingsCard title="Org chart" description="Who reports to whom, with each person's teams. Set reporting lines from Members.">
      <OrgChart people={people} />
    </SettingsCard>
  );
}
