"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import "@uiw/react-md-editor/markdown-editor.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailEditorField, type EmailEditorFieldHandle } from "./email-editor";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Channel = "email" | "in_app";
type Locale = "en" | "fr";
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
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<EmailEditorFieldHandle>(null);

  // The row for the active channel/locale. The email editor loads its initial
  // content synchronously from this (TipTap won't react to a later prop change),
  // keyed by channel-locale so switching tabs remounts with the right content.
  const current = initial.find((t) => t.channel === channel && t.locale === locale);

  useEffect(() => {
    setSubject(current?.subject ?? "");
    setBody(current?.body ?? "");
    setEnabled(current?.enabled ?? true);
    setPreview("");
  }, [channel, locale, current]);

  async function save() {
    setBusy(true);
    let payload: Record<string, unknown> = { event, channel, locale, subject, enabled };
    if (channel === "email") {
      if (!emailRef.current) {
        setBusy(false);
        toast.error("Editor not ready — please wait and try again");
        return;
      }
      const out = await emailRef.current.exportEmail();
      payload = { ...payload, body: out.body, html: out.html, text: out.text };
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

  async function preview_() {
    if (channel === "email") {
      if (!emailRef.current) {
        toast.error("Editor not ready — please wait and try again");
        return;
      }
      const out = await emailRef.current.exportEmail();
      setPreview(out.html);
    } else {
      setPreview(`<pre style="font-family:system-ui;padding:16px">${body}</pre>`);
    }
  }

  async function sendTest() {
    if (channel !== "email") {
      toast.error("Test send is email only");
      return;
    }
    if (!emailRef.current) {
      toast.error("Editor not ready — please wait and try again");
      return;
    }
    setBusy(true);
    const out = await emailRef.current.exportEmail();
    const res = await fetch("/api/notifications/templates/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, subject, html: out.html, text: out.text }),
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

      <Input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject / in-app title"
      />

      {channel === "email" ? (
        <EmailEditorField
          key={`${channel}-${locale}`}
          ref={emailRef}
          initialHtml={current?.body ?? ""}
          variables={variables}
        />
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
        <Button variant="outline" onClick={preview_} disabled={busy}>
          Preview
        </Button>
        {channel === "email" && (
          <Button variant="outline" onClick={sendTest} disabled={busy}>
            Send test
          </Button>
        )}
      </div>

      {preview && <iframe title="preview" srcDoc={preview} className="h-96 w-full rounded border" />}
    </div>
  );
}
