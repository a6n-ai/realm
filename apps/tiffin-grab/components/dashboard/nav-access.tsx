"use client";

import { createContext, useContext, type ReactNode } from "react";

const NavAccessContext = createContext<ReadonlySet<string> | null>(null);

export function NavAccessProvider({ hrefs, children }: { hrefs: readonly string[]; children: ReactNode }) {
  return <NavAccessContext.Provider value={new Set(hrefs)}>{children}</NavAccessContext.Provider>;
}

/** True when the caller's org role may open this nav href. */
export function useNavAllowed(): (href: string) => boolean {
  const set = useContext(NavAccessContext);
  return (href) => set?.has(href) ?? false;
}
