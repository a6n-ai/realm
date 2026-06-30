import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "react-email";

// Canonical source for the order_created email. Rendered to HTML by the seed
// (db/seed-notification-templates.ts) and stored in the template's `html` column.
// Keep {{order.*}} tokens literal — the send pipeline interpolates them.
// Author here, not in the DB; re-seed to publish. Admins may hand-tweak the
// stored HTML for one-offs, but a re-seed overwrites it.

const BRAND = "#dd8a2d";
const INK = "#2b2017";
const MUTED = "#6b5b45";
const FAINT = "#9a8a72";
const CANVAS = "#faf6f0";
const LINE = "#ece0d2";

export function OrderCreatedEmail() {
  return (
    <Html dir="ltr" lang="en">
      <Head />
      <Preview>Order {"{{order.code}}"} confirmed — we&apos;re getting your tiffin ready.</Preview>
      <Body style={{ backgroundColor: CANVAS, margin: 0, padding: 0, fontFamily: "Inter, Arial, sans-serif" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 16px" }}>
          <Section
            style={{
              backgroundColor: "#ffffff",
              border: `1px solid ${LINE}`,
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <Section style={{ backgroundColor: BRAND, padding: "20px 40px" }}>
              <Text style={{ margin: 0, fontSize: "18px", fontWeight: 700, letterSpacing: "-0.2px", color: "#fffaf3" }}>
                🍱&nbsp; Tiffin&nbsp;Grab
              </Text>
            </Section>

            <Section style={{ padding: "44px 40px 8px" }}>
              <Text
                style={{
                  margin: "0 0 6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.6px",
                  textTransform: "uppercase",
                  color: BRAND,
                }}
              >
                Order received
              </Text>
              <Heading
                style={{ margin: 0, fontSize: "30px", lineHeight: 1.15, letterSpacing: "-0.6px", color: INK }}
              >
                Thanks, {"{{order.customerName}}"} 👋
              </Heading>
              <Text style={{ margin: "16px 0 0", fontSize: "15px", lineHeight: 1.6, color: MUTED }}>
                We&apos;ve got your order and our kitchen is on it. You&apos;ll get another note the moment your tiffin
                is activated and out for delivery.
              </Text>
            </Section>

            <Section style={{ padding: "24px 40px 4px" }}>
              <Section
                style={{
                  backgroundColor: CANVAS,
                  border: `1px solid ${LINE}`,
                  borderRadius: "10px",
                  padding: "14px 18px",
                }}
              >
                <Text
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    letterSpacing: "0.4px",
                    textTransform: "uppercase",
                    color: FAINT,
                  }}
                >
                  Order code
                </Text>
                <Text
                  style={{
                    margin: "4px 0 0",
                    fontSize: "20px",
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    color: INK,
                    fontFamily: "'Courier New', monospace",
                  }}
                >
                  {"{{order.code}}"}
                </Text>
              </Section>
            </Section>

            <Section style={{ padding: "28px 40px 8px" }}>
              <Button
                href="https://tiffingrab.example/orders/{{order.code}}"
                style={{
                  display: "inline-block",
                  backgroundColor: BRAND,
                  color: "#fffaf3",
                  fontSize: "15px",
                  fontWeight: 600,
                  textDecoration: "none",
                  padding: "13px 26px",
                  borderRadius: "10px",
                }}
              >
                View your order
              </Button>
            </Section>

            <Section style={{ padding: "32px 40px 40px" }}>
              <Hr style={{ borderColor: LINE, margin: "0 0 20px" }} />
              <Text style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: FAINT }}>
                Questions about order <strong style={{ color: MUTED }}>{"{{order.code}}"}</strong>? Just reply to this
                email and our team will help you out.
              </Text>
            </Section>
          </Section>

          <Section style={{ padding: "24px 40px 0", textAlign: "center" }}>
            <Text style={{ margin: 0, fontSize: "12px", lineHeight: 1.6, color: "#b3a48d" }}>
              Tiffin Grab · Fresh tiffins, delivered daily
              <br />
              You&apos;re receiving this because you placed an order with us.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default OrderCreatedEmail;
