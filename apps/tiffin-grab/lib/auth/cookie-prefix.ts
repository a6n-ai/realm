// Not Better Auth's default "better-auth": on 2026-09-28 the session cookie moved from
// host-only (app.tiffingrab.ca) to Domain=tiffingrab.ca. A browser still holding the old
// host-only cookie sends both under one name, the stale one is read first, and sign-in
// loops back to /login. A new name makes every pre-move cookie inert.
export const AUTH_COOKIE_PREFIX = "tiffingrab";

// `__Secure-` is added when cookies are secure (production).
export const SESSION_COOKIES = [
  `${AUTH_COOKIE_PREFIX}.session_token`,
  `__Secure-${AUTH_COOKIE_PREFIX}.session_token`,
];
