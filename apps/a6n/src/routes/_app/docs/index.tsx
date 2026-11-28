import { DeniedState, ErrorState } from "@foundry/console/error-state";
import { ConfirmDialog } from "@foundry/console/confirm-dialog";
import { confirmAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Input } from "@foundry/ui/input";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { DocList } from "../../../components/docs/doc-list";
import { KIND_LABEL, KIND_ORDER } from "../../../components/docs/kinds";
import { ShareFromList, type Sharing } from "../../../components/docs/share-from-list";
import { TAB_LINK } from "../../../components/link-class";
import { EmptyState } from "../../../components/page/empty-state";
import { DocsSkeleton } from "../../../components/page/skeletons";
import { PageHeader } from "../../../components/shell/page-header";
import { createDocFn, emptyTrashFn, getDocFn, libraryFn } from "../../../lib/docs/docs.fns";
import type { LibraryItem } from "../../../lib/docs/library";
import type { DocKind } from "../../../lib/docs/meta";
import { errorText } from "../../../lib/error-copy";
import { getMeetingDocFn } from "../../../lib/meeting-docs/meeting-docs.fns";

const crumbs = [{ label: "Docs" }];

type View = "all" | DocKind | "shared" | "trash";
const VIEWS: { view: View; label: string }[] = [
  { view: "all", label: "All" },
  ...KIND_ORDER.map((view) => ({ view, label: KIND_LABEL[view] })),
  { view: "shared", label: "Shared with me" },
  { view: "trash", label: "Trash" },
];

function inView(view: View, items: LibraryItem[], trash: LibraryItem[]) {
  if (view === "trash") return trash;
  if (view === "all") return items;
  return items.filter((d) => (view === "shared" ? d.source === "shared" : d.kind === view));
}

export const Route = createFileRoute("/_app/docs/")({
  validateSearch: (search: Record<string, unknown>): { view?: View; share?: string } => {
    const view = VIEWS.find((v) => v.view === search.view && v.view !== "all")?.view;
    return { ...(view ? { view } : {}), ...(typeof search.share === "string" ? { share: search.share } : {}) };
  },
  loaderDeps: ({ search }) => ({ share: search.share }),
  loader: async ({ deps }) => {
    const library = await libraryFn();
    const target = library?.items.find((d) => d.id === deps.share && d.can.share);
    let sharing: Sharing | null = null;
    if (target) {
      const data = { docId: target.id };
      sharing =
        target.source === "mine"
          ? { source: "mine", data: await getDocFn({ data }) }
          : { source: "inquiry", data: await getMeetingDocFn({ data }) };
    }
    return { library, sharing };
  },
  pendingComponent: DocsSkeleton,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return (
      <>
        <PageHeader title="Docs" crumbs={crumbs} />
        <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />
      </>
    );
  },
  component: DocsPage,
});

function NewDocMenu({ preferred }: { preferred?: DocKind }) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  async function create(kind: DocKind) {
    setCreating(true);
    try {
      const res = await createDocFn({ data: { kind } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      await navigate({ to: "/docs/$docId", params: { docId: res.id } });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setCreating(false);
    }
  }

  const kinds = preferred ? [preferred, ...KIND_ORDER.filter((k) => k !== preferred)] : KIND_ORDER;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button disabled={creating} />}>
        <PlusIcon aria-hidden className="size-4" />
        New doc
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {kinds.map((kind) => (
          <DropdownMenuItem key={kind} onClick={() => void create(kind)}>
            {KIND_LABEL[kind]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyTrash({ count }: { count: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setConfirming(true)}>
        <Trash2Icon aria-hidden className="size-4" />
        Empty Trash
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Empty Trash?"
        description={`${count} ${count === 1 ? "doc disappears" : "docs disappear"} from a6n for everyone. You cannot bring them back here.`}
        confirmLabel="Delete forever"
        onConfirm={async () => {
          await confirmAction(() => emptyTrashFn({ data: {} }), "Trash emptied", () => router.invalidate(), errorText);
          setConfirming(false);
        }}
      />
    </>
  );
}

function DocsPage() {
  const { library, sharing } = Route.useLoaderData();
  const view = Route.useSearch().view ?? "all";
  const [query, setQuery] = useState("");
  const kind = KIND_ORDER.find((k) => k === view);
  const shown = library
    ? inView(view, library.items, library.trash).filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const deletable = library?.trash.filter((d) => d.can.deleteForever).length ?? 0;

  return (
    <>
      <PageHeader
        title="Docs"
        crumbs={crumbs}
        description="Notes, ideas and client docs."
        actions={library ? view === "trash" ? deletable ? <EmptyTrash count={deletable} /> : undefined : <NewDocMenu preferred={kind} /> : undefined}
      />
      {library ? (
        <div className="grid gap-3 px-4 pb-8">
          <nav aria-label="Docs" className="flex gap-1 overflow-x-auto">
            {VIEWS.map((v) => (
              <Link
                key={v.view}
                to="/docs"
                search={v.view === "all" ? {} : { view: v.view }}
                data-active={view === v.view}
                aria-current={view === v.view ? "page" : undefined}
                className={TAB_LINK}
              >
                {v.label}
              </Link>
            ))}
          </nav>
          <Input type="search" aria-label="Search titles" placeholder="Search titles…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
          {shown.length ? (
            <DocList docs={shown} />
          ) : query.trim() ? (
            <EmptyState icon={FileTextIcon} title="No docs match your search" />
          ) : view === "trash" ? (
            <EmptyState icon={Trash2Icon} title="Trash is empty" />
          ) : view === "shared" ? (
            <EmptyState icon={FileTextIcon} title="Nothing shared with you yet" />
          ) : (
            <EmptyState icon={FileTextIcon} title="No docs here yet" action={<NewDocMenu preferred={kind} />} />
          )}
          {sharing ? <ShareFromList sharing={sharing} /> : null}
        </div>
      ) : (
        <DeniedState />
      )}
    </>
  );
}
