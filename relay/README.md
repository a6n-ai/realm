# Relay

Multi-channel notification product: operator app, own login, own Postgres, drain worker, engine + channels + SDK.

Canonical remote: [a6n-ai/relay](https://github.com/a6n-ai/relay). Other products (Realm, Monarch, Copper+Cloves) are tenants with API keys — they do not share Relay users. The copy inside Realm **stays** until [EXTRACTION.md](../EXTRACTION.md) phase 4 — do not delete it.

Packages:

- `@relay/engine` — outbox, drain, policy, campaigns, suppression
- `@relay/email` / `@relay/sms` / `@relay/whatsapp` — channel adapters
- `@relay/sdk` — HTTP client
- `@relay/ui` — composer / logs / bell (re-exports engine UI)
