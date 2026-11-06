/** The floating bar (Home, Refer, Order) is on every public page except the order flow, which draws its own bottom bar. */
export function pillVisible(pathname: string): boolean {
  return !(pathname === "/subscribe" || pathname.startsWith("/subscribe/"));
}
