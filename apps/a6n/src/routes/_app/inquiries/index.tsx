import { EmptyState } from "@foundry/console/empty-state";
import { DeniedState, ErrorState } from "@foundry/console/error-state";
import type { Facet } from "@foundry/console/filters";
import { withoutKey } from "@foundry/console/filters";
import { FilterMenu } from "@foundry/console/filter-menu";
import { ListSkeleton } from "@foundry/console/list-skeleton";
import { PageHeader } from "@foundry/console/page-header";
import { Pager } from "@foundry/console/pager";
import { ResourceTable } from "@foundry/console/resource-table";
import { useConsoleRouter } from "@foundry/console/router";
import { SearchTabs } from "@foundry/console/search-tabs";
import { SearchInput, Toolbar } from "@foundry/console/toolbar";
import { useUrlFilter } from "@foundry/console/use-url-filter";
import { Button } from "@foundry/ui/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { InboxIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { inquiryColumns, inquiryLabel } from "../../../components/inquiries/columns";
import { STAGE_LABEL } from "../../../components/inquiries/labels";
import { NewInquiryDialog } from "../../../components/inquiries/new-inquiry-dialog";
import { errorText } from "../../../lib/error-copy";
import { listActiveSourcesFn, listInquiriesFn, listOwnersFn } from "../../../lib/inquiries/inquiries.fns";
import { STAGES } from "../../../lib/inquiries/stages";

type View = "mine" | "unassigned" | "all";
type InquirySearch = { view?: View; q?: string; stage?: string; source?: string; owner?: string; page?: number };

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_app/inquiries/")({
  validateSearch: (s: Record<string, unknown>): InquirySearch => {
    const page = Number(s.page);
    return {
      view: s.view === "unassigned" || s.view === "all" ? s.view : undefined,
      q: str(s.q),
      stage: STAGES.find((x) => x === s.stage),
      source: str(s.source),
      owner: str(s.owner),
      page: Number.isInteger(page) && page > 1 ? page : undefined,
    };
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    const [list, sources, owners] = await Promise.all([
      listInquiriesFn({ data: { ...search, page: search.page ?? 1 } }),
      listActiveSourcesFn(),
      listOwnersFn(),
    ]);
    return { list, sources, owners };
  },
  pendingComponent: () => (
    <>
      <PageHeader crumbs={[{ label: "Inquiries" }]} />
      <ListSkeleton />
    </>
  ),
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader crumbs={[{ label: "Inquiries" }]} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: InquiriesPage,
});

function InquiriesPage() {
  const { list, sources, owners } = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useConsoleRouter();
  const navigate = router.useNavigate();
  const [q, setQ] = useUrlFilter("q", { reset: ["page"] });
  const [creating, setCreating] = useState(false);

  if (!list) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Inquiries" }]} />
        <DeniedState />
      </>
    );
  }

  const facets: Facet[] = [
    { key: "stage", label: "Stage", options: STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })) },
    { key: "source", label: "Source", options: (sources?.sources ?? []).map((s) => ({ value: s.id, label: s.label })) },
    { key: "owner", label: "Owner", options: (owners ?? []).map((o) => ({ value: o.id, label: o.name })) },
  ];
  const filtered = Boolean(search.q || search.stage || search.source || search.owner);
  const clear = () => navigate({ search: { view: search.view }, replace: true });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inquiries" }]}
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon />
            New inquiry
          </Button>
        }
      />
      <SearchTabs
        param="view"
        reset={["page"]}
        tabs={[
          { value: "mine", label: "Mine" },
          { value: "unassigned", label: "Unassigned", count: shell.unassigned.total },
          { value: "all", label: "All" },
        ]}
      />
      <Toolbar
        search={<SearchInput value={q} onChange={setQ} placeholder="Search name, company, email or phone" />}
        filters={<FilterMenu facets={facets} value={search} onChange={(next) => navigate({ search: withoutKey(next, "page"), replace: true })} />}
      />
      <ResourceTable
        label="Inquiries"
        columns={inquiryColumns}
        rows={list.rows}
        rowKey={(r) => r.id}
        rowLabel={inquiryLabel}
        rowHref={(r) => ({ to: `/inquiries/${r.id}` })}
        offset={(list.page - 1) * 50}
        empty={
          <EmptyState
            icon={InboxIcon}
            title={filtered ? "No inquiries match" : "No inquiries here yet"}
            description={filtered ? "Try a different search or clear the filters." : "New inquiries you log or claim will show up here."}
            action={
              filtered ? (
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setCreating(true)}>New inquiry</Button>
              )
            }
          />
        }
      />
      <Pager page={list.page} hasNext={list.hasNext} />
      <NewInquiryDialog open={creating} onOpenChange={setCreating} sources={sources?.sources ?? []} subsources={sources?.subsources ?? []} />
    </>
  );
}
