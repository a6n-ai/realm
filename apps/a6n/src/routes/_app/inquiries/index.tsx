import { DeniedState, ErrorState } from "@foundry/console/error-state";
import type { Facet } from "@foundry/console/filters";
import { Pager } from "@foundry/console/pager";
import { ResourceTable } from "@foundry/console/resource-table";
import { useConsoleRouter } from "@foundry/console/router";
import { SearchTabs } from "@foundry/console/search-tabs";
import { SearchInput, Toolbar } from "@foundry/console/toolbar";
import { useUrlFilter } from "@foundry/console/use-url-filter";
import { Button } from "@foundry/ui/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { InboxIcon, KanbanIcon, ListIcon } from "lucide-react";
import { inquiryColumns, inquiryLabel } from "../../../components/inquiries/columns";
import { InquiryBoard } from "../../../components/inquiries/inquiry-board";
import { STAGE_LABEL } from "../../../components/inquiries/labels";
import { FilterBar } from "../../../components/page/filter-bar";
import { EmptyState } from "../../../components/page/empty-state";
import { Panel } from "../../../components/page/panel";
import { useCreate } from "../../../components/shell/create-dialogs";
import { PageHeader } from "../../../components/shell/page-header";
import { errorText } from "../../../lib/error-copy";
import { listActiveSourcesFn, listBoardFn, listInquiriesFn, listOwnersFn } from "../../../lib/inquiries/inquiries.fns";
import { STAGES } from "../../../lib/inquiries/stages";
import { BoardSkeleton, InquiriesSkeleton } from "../../../components/page/skeletons";


type View = "mine" | "unassigned" | "all";
type InquirySearch = { view?: View; layout?: "board"; q?: string; stage?: string; source?: string; owner?: string; due?: "1"; page?: number };

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_app/inquiries/")({
  validateSearch: (s: Record<string, unknown>): InquirySearch => {
    const page = Number(s.page);
    return {
      layout: s.layout === "board" ? "board" : undefined,
      view: s.view === "unassigned" || s.view === "all" ? s.view : undefined,
      q: str(typeof s.q === "number" ? String(s.q) : s.q),
      stage: STAGES.find((x) => x === s.stage),
      source: str(s.source),
      owner: str(s.owner),
      due: s.due === "1" || s.due === 1 ? "1" : undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
    };
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    const { layout, stage: _stage, page: _page, ...boardSearch } = search;
    const [list, board, sources, owners] = await Promise.all([
      layout === "board" ? null : listInquiriesFn({ data: { ...search, page: search.page ?? 1 } }),
      layout === "board" ? listBoardFn({ data: boardSearch }) : null,
      listActiveSourcesFn(),
      listOwnersFn(),
    ]);
    return { list, board, sources, owners };
  },
  pendingComponent: () => (Route.useSearch().layout === "board" ? <BoardPending /> : <InquiriesSkeleton />),
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

function BoardPending() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Inquiries" }]} />
      <BoardSkeleton />
    </>
  );
}

function LayoutToggle({ board, onChange }: { board: boolean; onChange: (board: boolean) => void }) {
  const item = (on: boolean, label: string, Icon: typeof ListIcon, value: boolean) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(value)}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Layout" className="inline-flex gap-0.5 rounded-lg border p-0.5">
      {item(!board, "List", ListIcon, false)}
      {item(board, "Board", KanbanIcon, true)}
    </div>
  );
}

function InquiriesPage() {
  const { list, board, sources, owners } = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useConsoleRouter();
  const navigate = router.useNavigate();
  const [q, setQ] = useUrlFilter("q", { reset: ["page"] });
  const create = useCreate();

  const boardView = search.layout === "board";
  if (boardView ? !board : !list) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Inquiries" }]} />
        <DeniedState />
      </>
    );
  }

  const facets: Facet[] = [
    ...(boardView ? [] : [{ key: "stage", label: "Stage", options: STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })) }]),
    { key: "source", label: "Source", options: (sources?.sources ?? []).map((s) => ({ value: s.id, label: s.label })) },
    { key: "owner", label: "Owner", options: (owners ?? []).map((o) => ({ value: o.id, label: o.name })) },
    { key: "due", label: "Follow-up", options: [{ value: "1", label: "Due" }] },
  ];
  const filtered = Boolean((boardView ? false : search.stage) || search.q || search.source || search.owner || search.due);
  const clear = () => navigate({ search: { view: search.view, layout: search.layout }, replace: true });

  return (
    <>
      <PageHeader crumbs={[{ label: "Inquiries" }]} />
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
        view={<LayoutToggle board={boardView} onChange={(next) => navigate({ search: (prev) => ({ ...prev, layout: next ? "board" : undefined, page: undefined }), replace: true })} />}
        filters={<FilterBar facets={facets} value={search} onChange={(next) => navigate({ search: next, replace: true })} prefer={{ owner: shell.user.id }} />}
      />
      {boardView ? (
        <InquiryBoard columns={board!} canEdit={shell.permissions.includes("inquiry:update")} viewAll={(stage) => ({ ...search, layout: undefined, stage })} />
      ) : (
      <Panel>
        <ResourceTable
          label="Inquiries"
          columns={inquiryColumns(shell.permissions.includes("inquiry:update"))}
          rows={list!.rows}
          rowKey={(r) => r.id}
          rowLabel={inquiryLabel}
          rowHref={(r) => ({ to: `/inquiries/${r.id}` })}
          offset={(list!.page - 1) * 50}
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
                  <Button onClick={() => create("inquiry")}>New inquiry</Button>
                )
              }
            />
          }
        />
      </Panel>
      )}
      {boardView ? null : <Pager page={list!.page} hasNext={list!.hasNext} />}
    </>
  );
}
