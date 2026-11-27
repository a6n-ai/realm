import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { useConsoleRouter } from "@foundry/console/router";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { FilterBar } from "../../components/page/filter-bar";
import { PageHeader } from "../../components/shell/page-header";
import { SourcesTable } from "../../components/sources/sources-table";
import { errorText } from "../../lib/error-copy";
import { listSourcesFn } from "../../lib/inquiries/sources.fns";
import { SourcesSkeleton } from "../../components/page/skeletons";


const FACETS = [{ key: "active", label: "Status", options: [{ value: "yes", label: "Active" }, { value: "no", label: "Inactive" }] }];

export const Route = createFileRoute("/_app/sources")({
  validateSearch: (s: Record<string, unknown>): { active?: "yes" | "no" } => ({ active: s.active === "yes" || s.active === "no" ? s.active : undefined }),
  loader: () => listSourcesFn(),
  pendingComponent: SourcesSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader crumbs={[{ label: "Sources" }]} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: SourcesPage,
});

function SourcesPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useConsoleRouter().useNavigate();
  if (!data) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Sources" }]} />
        <DeniedState />
      </>
    );
  }
  const shown = search.active ? data.sources.filter((s) => !!s.active === (search.active === "yes")) : data.sources;
  return (
    <>
      <PageHeader crumbs={[{ label: "Sources" }]} description="The channels inquiries come from." />
      <div className="px-4 pb-4">
        <FilterBar facets={FACETS} value={search} onChange={(next) => navigate({ search: next, replace: true })} />
      </div>
      <SourcesTable sources={shown} subsources={data.subsources} filtered={Boolean(search.active)} />
    </>
  );
}
