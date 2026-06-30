import { Body, Container, Head, Heading, Html, Markdown, render } from "@react-email/components";
import { interpolate } from "./interpolate";

const CONTAINER = { fontFamily: "system-ui, sans-serif", color: "#111", maxWidth: "520px", margin: "0 auto", padding: "24px", background: "#fff" };

function BrandedEmail({ markdown }: { markdown: string }) {
  return (
    <Html lang="en">
      <Head />
      <Body style={{ backgroundColor: "#f6f6f6", margin: 0 }}>
        <Container style={CONTAINER}>
          <Heading style={{ margin: "0 0 8px" }}>Tiffin Grab</Heading>
          <Markdown>{markdown}</Markdown>
        </Container>
      </Body>
    </Html>
  );
}

/** Interpolate {{vars}} then render the branded email to HTML + plaintext. */
export async function renderEmailTemplate(input: {
  subject: string;
  body: string;
  vars: Record<string, unknown>;
}): Promise<{ subject: string; html: string; text: string }> {
  const subject = interpolate(input.subject, input.vars);
  const markdown = interpolate(input.body, input.vars);
  const html = await render(<BrandedEmail markdown={markdown} />);
  const text = await render(<BrandedEmail markdown={markdown} />, { plainText: true });
  return { subject, html, text };
}

/** In-app rendering: interpolated title + plaintext body (no email chrome). */
export function renderInApp(input: {
  subject: string;
  body: string;
  vars: Record<string, unknown>;
}): { title: string; body: string } {
  return {
    title: interpolate(input.subject, input.vars),
    body: interpolate(input.body, input.vars),
  };
}
