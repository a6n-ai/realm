/**
 * Idempotent seed: notification_template rows for the auth/security emails
 * migrated off @foundry/auth's direct-send path onto the notification
 * pipeline (2026-09). Copy is ported verbatim from
 * @foundry/auth/src/emails.ts, rendered once through the same branded-
 * markdown wrapper that path used. No interpolation happens here (unlike
 * @foundry/email's renderEmailTemplate, which would turn a missing {{var}}
 * into "" instead of leaving it) — the {{var}} placeholders pass through
 * untouched, for @relay/engine's own interpolate() to fill at send time.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/tiffin-grab/db/seed-auth-email-templates.ts
 */
import { Body, Container, Head, Heading, Html, Markdown, render } from "@react-email/components";
import { db } from "./client";
import { notificationTemplate } from "./schema";

const APP_NAME = "Tiffin Grab";
// Brand pulled from apps/tiffin-grab/app/globals.css :root — the live site's
// actual computed colors (orange is the dominant brand hue there, cream the
// page background), not invented for this file. Reimplemented locally rather
// than imported from @foundry/email/@relay/email because that package ships
// raw .tsx and esbuild (via tsx CLI) resolves it as classic-runtime JSX when
// walked to from inside node_modules, losing the automatic-runtime config
// this app's own tsconfig sets.
const BRAND = "#F06B1A";
const BG = "#FBF4E7";
const FG = "#241F1B";
const MUTED = "#6E6558";
const CONTAINER = { fontFamily: "system-ui, sans-serif", color: FG, maxWidth: "520px", margin: "0 auto", padding: "32px 24px 24px", background: "#fff", borderRadius: "12px", overflow: "hidden" };
function BrandedEmail({ appName, markdown }: { appName: string; markdown: string }) {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: BG, margin: 0, padding: "24px 0" }}>
        <Container style={CONTAINER}>
          <div style={{ borderBottom: `3px solid ${BRAND}`, paddingBottom: "16px", marginBottom: "20px" }}>
            <Heading style={{ margin: 0, fontSize: "20px", color: BRAND }}>{appName}</Heading>
          </div>
          <Markdown>{markdown}</Markdown>
          {/* No unsubscribe link — these are transactional security emails (CASL/
             CAN-SPAM don't require one), and @relay/engine's appendUnsubscribeFooter
             already handles it separately for anything sent with kind: "marketing". */}
          <div style={{ borderTop: "1px solid #eee", marginTop: "28px", paddingTop: "16px", fontSize: "12px", color: MUTED, textAlign: "center" }}>
            {appName} · Greater Toronto Area
          </div>
        </Container>
      </Body>
    </Html>
  );
}

const ITEMS: { event: string; subject: string; body: string }[] = [
  {
    event: "email_verification_link",
    subject: `Verify your ${APP_NAME} email`,
    body: `Welcome to ${APP_NAME}! Confirm this email address to finish setting up your account.\n\n[Verify email]({{url}})\n\nIf you didn't create an account, ignore this email.`,
  },
  {
    event: "email_otp_password_reset",
    // Code leads the subject on purpose — iOS/Android mail autofill suggests
    // a numeric code from the subject/preview text, and it lands in the
    // notification preview without opening the email either way.
    subject: `{{otp}} is your ${APP_NAME} password reset code`,
    body: `Your password reset code is **{{otp}}**.\n\nIt expires in 10 minutes. If you didn't request this, ignore this email — your password is unchanged.`,
  },
  {
    event: "email_otp_verification",
    subject: `{{otp}} is your ${APP_NAME} verification code`,
    body: `Your verification code is **{{otp}}**.\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
  },
  {
    event: "account_deletion_confirm",
    subject: `Confirm deleting your ${APP_NAME} account`,
    body: `We received a request to permanently delete your ${APP_NAME} account.\n\n[Confirm account deletion]({{url}})\n\nThis cannot be undone. If you didn't request this, ignore this email and your account stays active.`,
  },
  {
    event: "password_changed",
    subject: `Your ${APP_NAME} password was changed`,
    body: `Your ${APP_NAME} account password was just changed. If this was you, no action is needed.\n\nIf you did **not** change it, reset your password immediately and contact support.`,
  },
  {
    event: "new_login_alert",
    subject: `New sign-in to your ${APP_NAME} account`,
    body: [
      `A new sign-in to your ${APP_NAME} account was detected.`,
      "",
      `- When: {{when}}`,
      `- IP: {{ip}}`,
      `- Device: {{userAgent}}`,
      "",
      "If this was you, no action is needed. If not, reset your password immediately.",
    ].join("\n"),
  },
  {
    event: "staff_invitation",
    subject: `You've been invited to ${APP_NAME}`,
    body: `You've been invited to join the ${APP_NAME} team as **{{role}}**.\n\n[Accept invitation]({{inviteUrl}})\n\nThis invite expires in 7 days.`,
  },
];

async function main() {
  for (const item of ITEMS) {
    const html = await render(<BrandedEmail appName={APP_NAME} markdown={item.body} />);
    const text = await render(<BrandedEmail appName={APP_NAME} markdown={item.body} />, { plainText: true });

    await db
      .insert(notificationTemplate)
      .values({
        event: item.event as never,
        channel: "email",
        locale: "en",
        subject: item.subject,
        body: html,
        html,
        text,
        enabled: true,
      })
      .onConflictDoUpdate({
        target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
        set: { subject: item.subject, body: html, html, text },
      });
    console.log(`seeded: ${item.event}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
