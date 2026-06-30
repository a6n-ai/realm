"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BellIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { lintEmailHtml } from "@/lib/notifications/email-compat";
import { compileReactEmail, REACT_SOURCE_MARKER } from "@/lib/notifications/react-template";
import "@uiw/react-md-editor/markdown-editor.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailEditorField, type EmailEditorFieldHandle } from "./email-editor";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Channel = "email" | "in_app";
type Locale = "en" | "fr";
type EmailMode = "visual" | "html" | "react";

const REACT_STARTER = `export default function Email() {
  return (
    <Html>
      <Body style={{ fontFamily: "Inter, Arial, sans-serif", backgroundColor: "#faf6f0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
          <Heading>Thanks, {"{{order.customerName}}"} 👋</Heading>
          <Text>Order {"{{order.code}}"} received — we're on it.</Text>
          <Button href="https://tiffingrab.example/orders/{{order.code}}">View order</Button>
        </Container>
      </Body>
    </Html>
  );
}`;

// ponytail: naive tag-strip for the plaintext fallback. Good enough for a text
// part; upgrade to a real html-to-text pass if deliverability complains.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Row {
  channel: Channel;
  locale: Locale;
  subject: string;
  body: string;
  html: string;
  text: string;
  enabled: boolean;
}

export function TemplateEditor({
  event,
  variables,
  initial,
}: {
  event: string;
  variables: string[];
  initial: Row[];
}) {
  const [channel, setChannel] = useState<Channel>("email");
  const [locale, setLocale] = useState<Locale>("en");
  const [mode, setMode] = useState<EmailMode>("visual");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [rawHtml, setRawHtml] = useState("");
  const [reactSource, setReactSource] = useState("");
  const [reactHtml, setReactHtml] = useState("");
  const [reactError, setReactError] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<EmailEditorFieldHandle>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const compatWarnings = useMemo(
    () => (channel === "email" && mode === "html" ? lintEmailHtml(rawHtml) : []),
    [channel, mode, rawHtml],
  );

  // Debounced live email preview — re-export the rendered HTML shortly after edits.
  function refreshEmailPreview() {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      const out = await emailRef.current?.exportEmail();
      if (out) setPreview(out.body);
    }, 250);
  }

  // The row for the active channel/locale. The email editor loads its initial
  // content synchronously from this (TipTap won't react to a later prop change),
  // keyed by channel-locale so switching tabs remounts with the right content.
  const current = initial.find((t) => t.channel === channel && t.locale === locale);

  useEffect(() => {
    const b = current?.body ?? "";
    const isReact = b.startsWith(REACT_SOURCE_MARKER);
    setSubject(current?.subject ?? "");
    setBody(b);
    setRawHtml(current?.html ?? "");
    setReactSource(isReact ? b.slice(REACT_SOURCE_MARKER.length) : "");
    setReactHtml(isReact ? (current?.html ?? "") : "");
    setReactError("");
    setMode(isReact ? "react" : "visual");
    setEnabled(current?.enabled ?? true);
    setPreview("");
  }, [channel, locale, current]);

  // Debounced client-side React compile — transpile + render in this browser.
  useEffect(() => {
    if (channel !== "email" || mode !== "react") return;
    if (!reactSource.trim()) {
      setReactHtml("");
      setReactError("");
      return;
    }
    const id = setTimeout(async () => {
      try {
        setReactHtml(await compileReactEmail(reactSource));
        setReactError("");
      } catch (e) {
        setReactError(e instanceof Error ? e.message : String(e));
      }
    }, 350);
    return () => clearTimeout(id);
  }, [channel, mode, reactSource]);

  async function save() {
    setBusy(true);
    let payload: Record<string, unknown> = { event, channel, locale, subject, enabled };
    if (channel === "email") {
      if (mode === "react") {
        let html: string;
        try {
          html = await compileReactEmail(reactSource);
        } catch (e) {
          setBusy(false);
          toast.error(`React compile failed: ${e instanceof Error ? e.message : String(e)}`);
          return;
        }
        payload = { ...payload, body: REACT_SOURCE_MARKER + reactSource, html, text: htmlToText(html) };
      } else if (mode === "html") {
        payload = { ...payload, body: rawHtml, html: rawHtml, text: htmlToText(rawHtml) };
      } else {
        if (!emailRef.current) {
          setBusy(false);
          toast.error("Editor not ready — please wait and try again");
          return;
        }
        const out = await emailRef.current.exportEmail();
        payload = { ...payload, body: out.body, html: out.html, text: out.text };
      }
    } else {
      payload = { ...payload, body };
    }
    const res = await fetch("/api/notifications/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    toast[res.ok ? "success" : "error"](res.ok ? "Template saved" : "Save failed");
  }

  async function sendTest() {
    if (channel !== "email") {
      toast.error("Test send is email only");
      return;
    }
    let html: string;
    let text: string;
    if (mode === "react") {
      try {
        html = await compileReactEmail(reactSource);
      } catch (e) {
        toast.error(`React compile failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      text = htmlToText(html);
    } else if (mode === "html") {
      html = rawHtml;
      text = htmlToText(rawHtml);
    } else {
      if (!emailRef.current) {
        toast.error("Editor not ready — please wait and try again");
        return;
      }
      const out = await emailRef.current.exportEmail();
      html = out.html;
      text = out.text;
    }
    setBusy(true);
    const res = await fetch("/api/notifications/templates/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, subject, html, text }),
    });
    setBusy(false);
    toast[res.ok ? "success" : "error"](res.ok ? "Test sent" : "Test failed");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          <TabsList>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="in_app">In-app</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          <TabsList>
            <TabsTrigger value="en">EN</TabsTrigger>
            <TabsTrigger value="fr">FR</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={setEnabled} /> Enabled
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editor column */}
        <div className="min-w-0 space-y-4">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject / in-app title"
          />

          {channel === "email" ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Tabs value={mode} onValueChange={(v) => setMode(v as EmailMode)}>
                  <TabsList>
                    <TabsTrigger value="visual">Visual</TabsTrigger>
                    <TabsTrigger value="html">HTML</TabsTrigger>
                    <TabsTrigger value="react">React</TabsTrigger>
                  </TabsList>
                </Tabs>
                {mode !== "visual" && variables.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Use {`{{var}}`} tokens, e.g. <code className="font-mono">{`{{${variables[0]}}}`}</code>
                  </span>
                )}
              </div>
              {mode === "visual" ? (
                <EmailEditorField
                  key={`${channel}-${locale}`}
                  ref={emailRef}
                  initialHtml={current?.body ?? ""}
                  variables={variables}
                  onChange={refreshEmailPreview}
                />
              ) : mode === "html" ? (
                <>
                  <textarea
                    value={rawHtml}
                    onChange={(e) => setRawHtml(e.target.value)}
                    spellCheck={false}
                    placeholder="<!DOCTYPE html> … paste rich email HTML here"
                    className="h-[600px] w-full resize-y rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {compatWarnings.length > 0 && (
                    <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs dark:border-amber-500/30 dark:bg-amber-950/30">
                      <p className="mb-1.5 flex items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
                        <TriangleAlertIcon className="size-3.5" />
                        Email client compatibility ({compatWarnings.length})
                      </p>
                      <ul className="space-y-0.5 text-amber-800 dark:text-amber-300">
                        {compatWarnings.map((w, i) => (
                          <li key={`${w.line}-${w.property}-${i}`}>
                            <span className="font-mono">L{w.line}</span> · <strong>{w.property}</strong> — not
                            supported in {w.clients}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <textarea
                    value={reactSource}
                    onChange={(e) => setReactSource(e.target.value)}
                    spellCheck={false}
                    placeholder={REACT_STARTER}
                    className="h-[600px] w-full resize-y rounded-lg border bg-muted/20 p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      <code className="font-mono">export default</code> a react-email component. Components
                      (Html, Body, Container, Heading, Text, Button…) are in scope — no imports needed.
                    </span>
                    {!reactSource.trim() && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setReactSource(REACT_STARTER)}>
                        Insert starter
                      </Button>
                    )}
                  </div>
                  {reactError && (
                    <div className="rounded-lg border border-red-300/60 bg-red-50 p-3 text-xs dark:border-red-500/30 dark:bg-red-950/30">
                      <p className="flex items-center gap-1.5 font-medium text-red-900 dark:text-red-200">
                        <TriangleAlertIcon className="size-3.5" /> Compile error
                      </p>
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-red-800 dark:text-red-300">{reactError}</pre>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="rounded bg-muted px-2 py-0.5 font-mono text-xs hover:bg-accent"
                      onClick={() => setBody((b) => `${b}{{${v}}}`)}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              )}
              <div data-color-mode="light">
                <MDEditor value={body} onChange={(v) => setBody(v ?? "")} height={280} />
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              Save
            </Button>
            {channel === "email" && (
              <Button variant="outline" onClick={sendTest} disabled={busy}>
                Send test
              </Button>
            )}
          </div>
        </div>

        {/* Live preview column */}
        <div className="lg:sticky lg:top-4 h-fit space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Live preview {channel === "email" ? "— email" : "— in-app"}
          </p>
          {channel === "email" ? (
            <iframe
              title="preview"
              srcDoc={mode === "html" ? rawHtml : mode === "react" ? reactHtml : preview}
              className="h-[600px] w-full rounded-lg border bg-white"
            />
          ) : (
            <InAppPreview title={subject} body={body} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Mirrors renderInApp: interpolated title + plaintext body, no markdown/email chrome. */
function InAppPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex gap-3">
        <BellIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-foreground">{title || "Notification title"}</p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {body || "Notification body…"}
          </p>
        </div>
      </div>
    </div>
  );
}
