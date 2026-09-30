/**
 * Every transactional email template, in the customer design system (DESIGN.md):
 * cream page, white hairline card, tracked saffron eyebrow, a title with one
 * italic saffron accent word, one saffron pill CTA, and one shared footer.
 *
 * Rendered once by db/seed-email-templates.tsx into notification_template rows.
 * `{{var}}` placeholders pass through untouched for @relay/engine to fill at send.
 * Inline styles and tables only — email clients ignore <style> and flexbox.
 */
import type { ReactNode } from "react";
import { Body, Container, Font, Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";

// Links must be absolute and must never point at a dev host once seeded into prod.
const BASE = (process.env.EMAIL_BASE_URL ?? "https://app.tiffingrab.ca").replace(/\/$/, "");

const C = {
  cream: "#FBF4E7",
  card: "#FFFFFF",
  ink: "#241F1B",
  muted: "#6E6558",
  hairline: "#E3DFD1",
  wash: "#F1EEE5",
  saffron: "#F06B1A",
  saffronWash: "#FBE3D2",
};
// Clients that load web fonts (Apple Mail, iOS) get Poppins; the rest fall back to system sans.
const POPPINS: [number, string][] = [
  [400, "https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecg.woff2"],
  [600, "https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2"],
  [700, "https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLCz7Z1xlFQ.woff2"],
];
const FONT = "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function Layout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        {POPPINS.map(([weight, url]) => (
          <Font
            key={weight}
            fontFamily="Poppins"
            fallbackFontFamily={["Helvetica", "Arial", "sans-serif"] as never}
            webFont={{ url, format: "woff2" }}
            fontWeight={weight}
            fontStyle="normal"
          />
        ))}
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: C.cream, margin: 0, padding: "32px 12px", fontFamily: FONT, color: C.ink }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto" }}>
          <Section style={{ padding: "0 8px 20px" }}>
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "middle", paddingRight: "10px" }}>
                    <Img src={`${BASE}/brand/mark-email.png`} width="36" height="36" alt="" />
                  </td>
                  <td style={{ verticalAlign: "middle", fontSize: "18px", fontWeight: 700, letterSpacing: "-0.02em", color: C.ink }}>
                    Tiffin <span style={{ color: C.saffron }}>Grab</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section
            style={{
              backgroundColor: C.card,
              border: `1px solid ${C.hairline}`,
              borderRadius: "24px",
              padding: "36px 32px 32px",
            }}
          >
            {children}
          </Section>
          <Footer />
        </Container>
      </Body>
    </Html>
  );
}

/** One footer for every email, so they read as one family. */
function Footer() {
  const link = { color: C.muted, textDecoration: "underline" };
  return (
    <Section style={{ padding: "24px 16px 8px", textAlign: "center" as const }}>
      <Text style={{ margin: "0 0 6px", fontSize: "13px", lineHeight: "20px", color: C.ink, fontWeight: 600 }}>
        Tiffin Grab
      </Text>
      <Text style={{ margin: "0 0 10px", fontSize: "12px", lineHeight: "18px", color: C.muted }}>
        Home-style tiffins, cooked in small batches across the Greater Toronto Area.
      </Text>
      <Text style={{ margin: "0 0 10px", fontSize: "12px", lineHeight: "18px", color: C.muted }}>
        <Link href={`${BASE}/me/account?section=notifications`} style={link}>
          Email preferences
        </Link>
        {"  ·  "}
        <Link href={`${BASE}/me/support`} style={link}>
          Help &amp; support
        </Link>
      </Text>
      <Text style={{ margin: 0, fontSize: "11px", lineHeight: "16px", color: C.muted }}>
        You're receiving this account email from Tiffin Grab.
      </Text>
    </Section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: "0 0 10px",
        fontSize: "12px",
        lineHeight: "16px",
        fontWeight: 600,
        letterSpacing: "0.25em",
        textTransform: "uppercase" as const,
        color: C.saffron,
      }}
    >
      {children}
    </Text>
  );
}

/** Title with one italic saffron accent word, per DESIGN.md. */
function Title({ lead, accent }: { lead: string; accent: string }) {
  return (
    <Text style={{ margin: "0 0 18px", fontSize: "28px", lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.03em", color: C.ink }}>
      {lead} <em style={{ color: C.saffron, fontStyle: "italic" }}>{accent}</em>
    </Text>
  );
}

function P({ children }: { children: ReactNode }) {
  return <Text style={{ margin: "0 0 16px", fontSize: "16px", lineHeight: "24px", color: C.ink }}>{children}</Text>;
}

function Note({ children }: { children: ReactNode }) {
  return <Text style={{ margin: "20px 0 0", fontSize: "13px", lineHeight: "20px", color: C.muted }}>{children}</Text>;
}

/** Bulletproof pill button: a padded table cell renders in Outlook too. */
function Cta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "8px 0 4px" }}>
      <tbody>
        <tr>
          <td
            style={{
              backgroundColor: C.saffron,
              borderRadius: "9999px",
              boxShadow: "0 12px 30px -8px rgba(240,107,26,0.7)",
            }}
          >
            <Link
              href={href}
              style={{
                display: "inline-block",
                padding: "15px 28px",
                fontSize: "16px",
                lineHeight: "22px",
                fontWeight: 600,
                color: "#FFFFFF",
                textDecoration: "none",
                borderRadius: "9999px",
              }}
            >
              {children}
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Code({ value }: { value: string }) {
  return (
    <Section style={{ backgroundColor: C.saffronWash, borderRadius: "16px", padding: "18px 12px", margin: "4px 0 8px", textAlign: "center" as const }}>
      <Text
        style={{
          margin: 0,
          fontSize: "34px",
          lineHeight: "40px",
          fontWeight: 700,
          letterSpacing: "0.3em",
          color: C.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Text>
    </Section>
  );
}

/** Key/value summary on a warm wash, like the customer app's detail rows. */
function Details({ rows }: { rows: [string, string][] }) {
  return (
    <Section style={{ backgroundColor: C.wash, borderRadius: "16px", padding: "6px 18px", margin: "4px 0 20px" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={k}>
              <td
                style={{
                  padding: "11px 12px 11px 0",
                  whiteSpace: "nowrap",
                  fontSize: "14px",
                  lineHeight: "20px",
                  color: C.muted,
                  borderTop: i === 0 ? "none" : `1px solid ${C.hairline}`,
                }}
              >
                {k}
              </td>
              <td
                align="right"
                style={{
                  padding: "11px 0",
                  fontSize: "14px",
                  lineHeight: "20px",
                  fontWeight: 600,
                  color: C.ink,
                  fontVariantNumeric: "tabular-nums",
                  borderTop: i === 0 ? "none" : `1px solid ${C.hairline}`,
                }}
              >
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export interface EmailTemplate {
  event: string;
  subject: string;
  element: ReactNode;
}

export const TEMPLATES: EmailTemplate[] = [
  {
    event: "email_verification_link",
    subject: "Confirm your Tiffin Grab email",
    element: (
      <Layout preview="One tap and your Tiffin Grab account is ready.">
        <Eyebrow>Welcome</Eyebrow>
        <Title lead="Confirm your" accent="email." />
        <P>One tap and your account is ready. You'll use this address to sign in and get delivery updates.</P>
        <Cta href="{{url}}">Confirm email</Cta>
        <Note>Didn't create a Tiffin Grab account? You can ignore this email.</Note>
      </Layout>
    ),
  },
  {
    // Code leads the subject so mail autofill and notification previews show it.
    event: "email_otp_password_reset",
    subject: "{{otp}} is your Tiffin Grab password reset code",
    element: (
      <Layout preview="Your code is {{otp}}. It expires in 10 minutes.">
        <Eyebrow>Password reset</Eyebrow>
        <Title lead="Reset your" accent="password." />
        <P>Enter this code to choose a new password.</P>
        <Code value="{{otp}}" />
        <Note>It expires in 10 minutes. Didn't ask for this? Ignore it — your password stays the same.</Note>
      </Layout>
    ),
  },
  {
    event: "email_otp_verification",
    subject: "{{otp}} is your Tiffin Grab verification code",
    element: (
      <Layout preview="Your code is {{otp}}. It expires in 10 minutes.">
        <Eyebrow>Verification</Eyebrow>
        <Title lead="Here's your" accent="code." />
        <P>Enter this code to continue.</P>
        <Code value="{{otp}}" />
        <Note>It expires in 10 minutes. Didn't request it? You can ignore this email.</Note>
      </Layout>
    ),
  },
  {
    event: "account_deletion_confirm",
    subject: "Confirm deleting your Tiffin Grab account",
    element: (
      <Layout preview="Confirm that you want to permanently delete your account.">
        <Eyebrow>Account</Eyebrow>
        <Title lead="Confirm account" accent="deletion." />
        <P>We got a request to permanently delete your Tiffin Grab account. This can't be undone.</P>
        <Cta href="{{url}}">Delete my account</Cta>
        <Note>Didn't ask for this? Ignore this email and your account stays active.</Note>
      </Layout>
    ),
  },
  {
    event: "password_changed",
    subject: "Your Tiffin Grab password was changed",
    element: (
      <Layout preview="If this was you, there's nothing to do.">
        <Eyebrow>Security</Eyebrow>
        <Title lead="Your password was" accent="changed." />
        <P>The password on your Tiffin Grab account was just changed. If that was you, there's nothing to do.</P>
        <Cta href={`${BASE}/forgot-password`}>Reset password</Cta>
        <Note>Didn't change it? Reset your password now, then let us know from Help &amp; support.</Note>
      </Layout>
    ),
  },
  {
    event: "new_login_alert",
    subject: "New sign-in to your Tiffin Grab account",
    element: (
      <Layout preview="A new sign-in to your account was detected.">
        <Eyebrow>Security</Eyebrow>
        <Title lead="New sign-in to your" accent="account." />
        <Details
          rows={[
            ["When", "{{when}}"],
            ["IP address", "{{ip}}"],
            ["Device", "{{userAgent}}"],
          ]}
        />
        <P>If this was you, there's nothing to do. If not, reset your password right away.</P>
        <Cta href={`${BASE}/forgot-password`}>Reset password</Cta>
      </Layout>
    ),
  },
  {
    event: "staff_invitation",
    subject: "You've been invited to Tiffin Grab",
    element: (
      <Layout preview="You've been invited to join the Tiffin Grab team as {{role}}.">
        <Eyebrow>Team invite</Eyebrow>
        <Title lead="Join the Tiffin Grab" accent="team." />
        <P>
          You've been invited as <strong>{"{{role}}"}</strong>. The link below signs you in and sets up your access.
        </P>
        <Cta href="{{inviteUrl}}">Accept invitation</Cta>
        <Note>This invite expires in 7 days.</Note>
      </Layout>
    ),
  },
  {
    event: "customer_invitation",
    subject: "Welcome to Tiffin Grab",
    element: (
      <Layout preview="Your account is ready — track deliveries, pick meals, pause anytime.">
        <Eyebrow>Welcome</Eyebrow>
        <Title lead="Your tiffins, your" accent="way." />
        <P>Your Tiffin Grab account is ready. Track your deliveries, pick your meals, and pause or reschedule anytime.</P>
        <Cta href="{{url}}">Open my account</Cta>
        <Note>
          This link signs you in once and works for 7 days. After that, sign in anytime with a code sent to this email —
          no password needed.
        </Note>
      </Layout>
    ),
  },
  {
    event: "payment_reminder",
    subject: "Your Tiffin Grab payment is still pending",
    element: (
      <Layout preview="Upload your payment screenshot so we can confirm it.">
        <Eyebrow>Payment pending</Eyebrow>
        <Title lead="Your payment is still" accent="pending." />
        <P>Hi {"{{payment.customerName}}"}, we haven't received this payment yet.</P>
        <Details
          rows={[
            ["Amount", "{{payment.amount}}"],
            ["Order", "{{payment.orderCode}}"],
            ["Method", "{{payment.method}}"],
          ]}
        />
        <P>Already sent it? Upload a screenshot so we can confirm it quickly.</P>
        <Cta href="{{payment.url}}">Upload payment screenshot</Cta>
        <Note>
          This link signs you in once and works for 7 days. After that, sign in with a code sent to this email and open
          Finances → Bills.
        </Note>
      </Layout>
    ),
  },
  {
    event: "payment_received",
    subject: "We received your Tiffin Grab payment details",
    element: (
      <Layout preview="We'll confirm your payment shortly.">
        <Eyebrow>Payment received</Eyebrow>
        <Title lead="Thanks, we've got your" accent="details." />
        <P>Hi {"{{payment.customerName}}"}, our team will check your payment and email you once it's confirmed.</P>
        <Details
          rows={[
            ["Amount", "{{payment.amount}}"],
            ["Order", "{{payment.orderCode}}"],
            ["Method", "{{payment.method}}"],
          ]}
        />
        <Cta href={`${BASE}/me/wallet?tab=bills`}>View my bills</Cta>
      </Layout>
    ),
  },
  {
    event: "payment_approved",
    subject: "Payment confirmed — your Tiffin Grab plan is set",
    element: (
      <Layout preview="Your payment is confirmed and your plan is set.">
        <Eyebrow>Payment confirmed</Eyebrow>
        <Title lead="You're all" accent="set." />
        <P>Hi {"{{payment.customerName}}"}, your payment of {"{{payment.amount}}"} is confirmed.</P>
        <Details
          rows={[
            ["Order", "{{payment.orderCode}}"],
            ["Starts", "{{payment.startDate}}"],
            ["Duration", "{{payment.durationWeeks}} weeks"],
            ["Delivery days", "{{payment.deliveryDays}}"],
          ]}
        />
        <Cta href={`${BASE}/me/deliveries`}>View my deliveries</Cta>
      </Layout>
    ),
  },
];
