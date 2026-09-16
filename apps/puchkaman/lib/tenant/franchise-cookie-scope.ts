import { Role, type RoleValue } from "@foundry/commons";

/**
 * Whether the visitor-picked `franchise` cookie may decide the acting
 * organization when nothing more specific has.
 *
 * Guests and signed-in customers both shop a franchise, so both follow the
 * cookie. Staff never do: a brand admin who browsed the public site would
 * otherwise have their whole dashboard resolve to whichever franchise they
 * last visited, which is why resolveActingOrg gated it in the first place.
 */
export function franchiseCookieApplies(session: { user: { role: RoleValue } } | null): boolean {
  return !session || session.user.role === Role.USER;
}
