import type { ConsoleRouter } from "@foundry/console/router";
import { Link, useLocation, useNavigate, useSearch } from "@tanstack/react-router";

// A nav item carries its view as "/inquiries?view=unassigned"; TanStack wants the path and the search apart.
function splitTo(to: string, search?: Record<string, unknown>): { to: string; search?: Record<string, unknown> } {
  const at = to.indexOf("?");
  if (at < 0) return { to, search };
  return { to: to.slice(0, at), search: { ...Object.fromEntries(new URLSearchParams(to.slice(at + 1))), ...search } };
}

export const tanstackConsoleRouter: ConsoleRouter = {
  Link: ({ to, search, replace, ref, ...rest }) => {
    const target = splitTo(to, search);
    return <Link ref={ref} to={target.to as never} search={target.search as never} replace={replace} {...rest} />;
  },
  useSearch: () => useSearch({ strict: false }) as Record<string, unknown>,
  usePathname: () => useLocation().pathname,
  useNavigate: () => {
    const navigate = useNavigate();
    return ({ to, search, replace }) => void navigate({ to: to ?? ".", search: search as never, replace });
  },
};
