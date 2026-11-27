import { ConsoleLink, type ConsoleSearch } from "@foundry/console/router";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { SidebarTrigger } from "@foundry/ui/sidebar";
import { ChevronLeftIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { CreateNewMenu } from "./add-new";

export type Crumb = { label: string; to?: string; search?: ConsoleSearch };

// Vercel's two rows: a top bar (scope left, page name centred, Create New right), then the big page title.
export function PageHeader({ crumbs, badge, actions, description }: { crumbs: Crumb[]; badge?: ReactNode; actions?: ReactNode; description?: string }) {
  const last = crumbs.length - 1;
  const title = crumbs[last]?.label;
  const parent = crumbs[last - 1];

  useEffect(() => {
    if (title) document.title = `${title} · a6n`;
  }, [title]);

  return (
    <>
      <header className="border-b">
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3">
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
              <span className="flex items-center gap-2 px-2 text-base font-medium">
                <Avatar size="sm" className="rounded-full after:rounded-full">
                  <AvatarFallback className="rounded-full bg-muted text-foreground">a</AvatarFallback>
                </Avatar>
                a6n
              </span>
            )}
          </div>
          <span className="hidden max-w-64 truncate text-sm font-medium sm:block">{title}</span>
          <div className="col-start-3 flex justify-end">
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
