import { ConsoleLink, type ConsoleSearch } from "@foundry/console/router";
import { SidebarTrigger } from "@foundry/ui/sidebar";
import { ChevronLeftIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect } from "react";
import { CreateNewMenu } from "./add-new";

export type Crumb = { label: string; to?: string; search?: ConsoleSearch };

// Vercel's two rows: a top bar (breadcrumb left, Create New right), then the big page title.
// `title` overrides the big title when the breadcrumb is longer than it (Settings / Account under "Settings").
export function PageHeader({ crumbs, title: titleOverride, badge, actions, description }: { crumbs: Crumb[]; title?: string; badge?: ReactNode; actions?: ReactNode; description?: string }) {
  const last = crumbs.length - 1;
  const title = titleOverride ?? crumbs[last]?.label;
  const parent = titleOverride ? undefined : crumbs[last - 1];

  useEffect(() => {
    if (title) document.title = `${title} · a6n`;
  }, [title]);

  return (
    <>
      <header className="border-b">
        <div className="flex h-14 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger size="icon" className="md:hidden" />
            {parent?.to ? (
              <ConsoleLink
                aria-label={`Back to ${parent.label}`}
                to={parent.to}
                search={parent.search}
                className="inline-flex h-9 items-center gap-1 rounded-md pr-3 pl-1.5 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeftIcon aria-hidden className="size-4" />
                {parent.label}
              </ConsoleLink>
            ) : (
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 px-2 text-sm text-muted-foreground">
                {crumbs.map((c, i) => (
                  <Fragment key={c.label}>
                    {i > 0 ? <span aria-hidden>/</span> : null}
                    <span className={i === last && last > 0 ? "truncate font-medium text-foreground" : undefined} aria-current={i === last ? "page" : undefined}>
                      {c.label}
                    </span>
                  </Fragment>
                ))}
              </nav>
            )}
          </div>
          <div className="flex shrink-0 justify-end">
            <CreateNewMenu />
          </div>
        </div>
      </header>
      {title ? (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pt-8 pb-6">
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-3xl font-semibold tracking-tight">{title}</h1>
              {badge}
            </div>
            {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </>
  );
}
