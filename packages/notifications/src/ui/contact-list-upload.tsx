"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseCsv } from "@realm/notifications";
import { apiFetch } from "@realm/notifications/ui";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@realm/ui/select";

const CONSENT_SOURCES = [
  { value: "purchase", label: "Existing customers (purchase)" },
  { value: "express_optin", label: "Express opt-in" },
  { value: "event_signup", label: "Event signup" },
  { value: "import_other", label: "Other" },
] as const;

const NONE = "__none__";

const SAMPLE_CSV = "name,email,phone\nJane Doe,jane@example.com,+16135551234\nJohn Smith,john@example.com,+16135555678\n";
const SAMPLE_CSV_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

/**
 * Create a list, then import a CSV into it.
 *
 * Consent provenance is asked for BEFORE the file, because it is a property of
 * how the list was gathered — and because a form that takes the addresses first
 * makes the consent question feel like an afterthought.
 */
export function ContactListUpload() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [consentSource, setConsentSource] = useState<string>("express_optin");
  const [consentNote, setConsentNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<{ email?: string; phone?: string; name?: string }>({});
  const [busy, setBusy] = useState(false);

  async function pick(f: File | null) {
    setFile(f);
    setHeaders([]);
    if (!f) return;
    // Parsed client-side purely to offer the column mapping; the server parses
    // the file again itself and trusts nothing from here.
    const { headers: h } = parseCsv(await f.text());
    setHeaders(h);
    setMapping({
      email: h.find((x) => /e-?mail/i.test(x)),
      phone: h.find((x) => /phone|mobile|cell/i.test(x)),
      name: h.find((x) => /name/i.test(x)),
    });
  }

  async function submit() {
    if (!name.trim()) return toast.error("Name the list");
    if (!file) return toast.error("Choose a CSV file");
    if (!mapping.email && !mapping.phone) return toast.error("Map an email or phone column");

    setBusy(true);
    try {
      const created = await apiFetch<{ publicId: string }>("/api/notifications/contact-lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          consentSource,
          consentAt: Date.now(),
          consentNote: consentNote || undefined,
        }),
      });

      const form = new FormData();
      form.set("file", file);
      form.set("mapping", JSON.stringify(mapping));
      const res = await apiFetch<{ imported: number; rejected: { row: number; reason: string }[] }>(
        `/api/notifications/contact-lists/${created.publicId}/import`,
        { method: "POST", body: form },
      );

      // Rejections are surfaced, not swallowed: a silent drop reads as data loss.
      toast.success(
        res.rejected.length
          ? `Imported ${res.imported}, skipped ${res.rejected.length}`
          : `Imported ${res.imported}`,
      );
      router.refresh();
      setName("");
      setFile(null);
      setHeaders([]);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  const columnSelect = (key: "email" | "phone" | "name", label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={mapping[key] ?? NONE}
        onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v === NONE ? undefined : v }))}
      >
        <SelectTrigger>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="listName">List name</Label>
          <Input id="listName" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>How was consent obtained?</Label>
          <Select value={consentSource} onValueChange={setConsentSource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONSENT_SOURCES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="consentNote">Consent note</Label>
        <Input
          id="consentNote"
          value={consentNote}
          onChange={(e) => setConsentNote(e.target.value)}
          placeholder="Where and when these people agreed to hear from you"
        />
        <p className="text-xs text-muted-foreground">
          Consent from a purchase expires after 24 months and the audience builder drops it
          automatically. A list you cannot account for should not be mailed.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="csv">CSV file</Label>
          <a
            href={SAMPLE_CSV_HREF}
            download="contact-list-sample.csv"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Download sample CSV
          </a>
        </div>
        <Input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        />
      </div>

      {headers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {columnSelect("email", "Email column")}
          {columnSelect("phone", "Phone column")}
          {columnSelect("name", "Name column")}
        </div>
      )}

      <Button onClick={submit} disabled={busy}>
        {busy ? "Importing…" : "Create list and import"}
      </Button>
    </div>
  );
}
