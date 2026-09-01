# Relay tenant for Realm apps

Realm apps are Relay **tenants**, not operator users. Create the tenant in the Relay
dashboard (or `pnpm --filter relay db:seed`) and put the API secret in the app env.

Relay operators sign in with the same Foundry auth pattern as Realm: Better Auth,
email OTP / password, `@foundry/auth-ui` reset, session-stamped
`UpdatableService` writes, `audit_log`.

## Provision

1. Run Relay (`apps/relay`, port 3010).
2. Open **Tenants** and click **Create Tiffin Grab + Puchkaman API keys** (or create
   slugs `tiffin-grab` / `puchkaman` yourself). Copy each secret once.
3. Add a **sending domain** per From address (`tiffingrab.ca`, `puchkaman.ca`) and
   publish the TXT records. Check DNS before marketing mail.
4. Point the app at Relay:

```bash
RELAY_API_URL=http://localhost:3010
RELAY_API_KEY=pk_live_…
```

Transactional mail inside the apps can still use SES/SMTP directly via
`EMAIL_TRANSPORT` (`ses` default, or `smtp` + `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`).
That is the same `@relay/email` provider Relay uses; it is not a Relay API key.

## Compliance

Set the tenant mailing country (default `CA`). Campaign audiences in `@relay/engine`
honour that profile: CASL implied consent (24 months) in Canada, CAN-SPAM opt-out
in the US, GDPR-style express opt-in in the EU.
