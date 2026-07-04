# Realm Platform Docs

Realm is a multi-client Turborepo: one platform, many Next.js client apps sharing
`@realm/*` packages. TiffinGrab is the first client.

- **[repo-structure.md](repo-structure.md)** — the package map, taxonomy, and the
  acyclic dependency layering.
- **[add-a-client.md](add-a-client.md)** — stand up a new client app (Gym,
  Dentist, …) reusing the shared packages.
- **[add-a-package.md](add-a-package.md)** — create a new `@realm/*` shared
  package (manifest, exports, RSC rules, anti-duplication).
- **[dev-build-workflow.md](dev-build-workflow.md)** — commands, the per-change
  verify contract, production build, and build gotchas.
