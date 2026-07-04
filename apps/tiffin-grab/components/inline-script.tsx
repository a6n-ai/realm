"use client";

// Renders an inline <script> that runs synchronously during HTML parsing on the
// server (type="text/javascript"), but is inert on the client (type="text/plain")
// so React does not warn about a script rendered inside a component. The script
// has already executed from the server HTML by the time the client hydrates.
// suppressHydrationWarning reconciles the server/client type attribute mismatch.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
