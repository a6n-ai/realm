const HIDDEN = ["/subscribe", "/refer"];

/** The phone pill (Refer + Order) stays off pages that are already ordering or referring. */
export function pillVisible(pathname: string): boolean {
  return !HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
