"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import "@uiw/react-md-editor/markdown-editor.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type Channel = "email" | "in_app";
type Locale = "en" | "fr";
interface TemplateRow {
  channel: Channel;
  locale: Locale;
  subject: string;
  body: string;
  enabled: boolean;
}

interface Props {
  event: string;
  variables: string[];
  initial: TemplateRow[];
}

export function TemplateEditor({ event, variables, initial }: Props) {
  const [channel, setChannel] = useState<Channel>("email");
  const [locale, setLocale] = useState<Locale>("en");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  // Load the stored values whenever the channel/locale tab changes.
  useEffect(() => {
    const row = initial.find((t) => t.channel === channel && t.locale === locale);
    setSubject(row?.subject ?? "");
    setBody(row?.body ?? "");
    setEnabled(row?.enabled ?? true);
    setPreview("");
  }, [channel, locale, initial]);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/notifications/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, channel, locale, subject, body, enabled }),
    });
    setBusy(false);
    if (res.ok) toast.success("Template saved");
    else toast.error((await res.text().catch(() => "")) || "Save failed");
  }

  async function refreshPreview() {
    const res = await fetch("/api/notifications/templates/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, subject, body }),
    });
    setPreview(res.ok ? await res.text() : "");
  }

  async function sendTest() {
    setBusy(true);
    const res = await fetch("/api/notifications/templates/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, subject, body }),
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

      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject / in-app title" />

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

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>Save</Button>
        <Button variant="outline" onClick={refreshPreview} disabled={busy}>Preview</Button>
        <Button variant="outline" onClick={sendTest} disabled={busy}>Send test</Button>
      </div>

      {preview && <iframe title="preview" srcDoc={preview} className="h-96 w-full rounded border" />}
    </div>
  );
}
