# Security Policy

## Supported versions

Realm is a continuously deployed platform, not a versioned release artifact.
Only the latest `main` (and the current production deployment) receives security
fixes. Older commits and branches are not maintained.

| Ref | Supported |
|-----|-----------|
| `main` (latest) | ✅ |
| Anything older | ❌ |

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report privately through either channel:

- **GitHub** — [Report a vulnerability](https://github.com/a6n-ai/realm/security/advisories/new)
  (Security → Advisories → Report a vulnerability). Preferred.
- **Email** — hrithikraj1997@gmail.com with subject `SECURITY: realm`.

Please include:

- affected area (app/package, route, or `@realm/*` package),
- steps to reproduce or a proof of concept,
- impact (what an attacker can read, change, or bypass),
- any suggested fix.

## What to expect

- **Acknowledgement** within 3 business days.
- **Assessment + severity** within 7 business days.
- A fix on `main` and the production deploy as soon as validated; timeline scales
  with severity. We will keep you updated and credit you on request once resolved.

## Scope

In scope: this repository's apps and `@realm/*` packages — authn/authz (better-auth,
role guards), the pricing/server-action trust boundary, audit-field stamping, file
storage access control, SQL/injection, secret exposure, and dependency vulnerabilities.

Out of scope: findings that require a compromised host or privileged local access,
volumetric DoS, and issues in third-party services we do not control.
