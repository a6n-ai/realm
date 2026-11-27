import type { ConsoleRouter } from "@foundry/console/router";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";

// A nav item carries its view as "/inquiries?view=unassigned"; TanStack wants the path and the search apart.
function splitTo(to: string, search?: Record<string, unknown>): { to: string; search?: Record<string, unknown> } {
  const at = to.indexOf("?");
  if (at < 0) return { to, search };
  return { to: to.slice(0, at), search: { ...Object.fromEntries(new URLSearchParams(to.slice(at + 1))), ...search } };
}

export const tanstackConsoleRouter: ConsoleRouter = {
  // Console owns aria-current. TanStack sets aria-current="page" (and class "active") on every active link, and
  // by default "active" is fuzzy, so a parent nav item would read as current on its child pages. Exact matching
  // limits TanStack's marker to a link to this very URL, where it agrees with console; empty activeProps drops the class.
  Link: ({ to, search, replace, ref, ...rest }) => {
    const target = splitTo(to, search);
    return (
      <Link
        ref={ref}
        to={target.to as never}
        search={target.search as never}
        replace={replace}
        activeOptions={{ exact: true }}
        activeProps={{}}
        {...rest}
      />
    );
  },
  useSearch: () => useSearch({ strict: false }) as Record<string, unknown>,
  usePathname: () => useLocation().pathname,
  useNavigate: () => {
    const navigate = useNavigate();
    return ({ to, search, replace }) => void navigate({ to: to ?? ".", search: search as never, replace });
  },
};
