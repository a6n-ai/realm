"use client";

import { createContext, useContext, type ReactNode } from "react";

const TimezoneContext = createContext<string | null>(null);

export function TimezoneProvider({ tz, children }: { tz: string; children: ReactNode }) {
  return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>;
}

/** The app-setting timezone. Throws when unmounted: a silent fallback to the browser's zone is
 *  precisely the bug this provider exists to prevent. */
export function useTimezone(): string {
  const tz = useContext(TimezoneContext);
  if (!tz) throw new Error("useTimezone must be used within <TimezoneProvider>");
  return tz;
}
