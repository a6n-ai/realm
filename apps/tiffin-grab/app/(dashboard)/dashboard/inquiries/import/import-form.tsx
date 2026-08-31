"use client";

import { useState } from "react";
import { DownloadIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { apiFetch } from "@/lib/http/api-fetch";
import { IMPORT_FIELDS, suggestMapping, type ImportFieldKey, type ImportMapping } from "./inquiry-import-columns";

type ImportResult = {
  totalRows: number;
  created: number;
  matched: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
};

const NONE = "__none__";

// First row of the sheet, as raw cell text — not xlsx's object-per-row mode, which
// silently dedupes/mangles duplicate or blank header cells before we ever see them.
function readHeaders(XLSXMod: typeof import("xlsx"), ws: import("xlsx").WorkSheet): string[] {
  const rows = XLSXMod.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  const first = (rows[0] as unknown[] | undefined) ?? [];
  const seen = new Map<string, number>();
  return first.map((v, i) => {
    const base = v == null || String(v).trim() === "" ? `Column ${i + 1}` : String(v).trim();
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}

export function ImportForm({ sources }: { sources: { key: string; label: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<import("xlsx").WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({ notes: [] });
  const [sourceKey, setSourceKey] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFileChange(f: File | null) {
    setFile(f);
    setResult(null);
    setParseError(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet("");
    setHeaders([]);
    setMapping({ notes: [] });
    if (!f) return;

    const XLSX = await import("xlsx");
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    if (wb.SheetNames.length === 0) {
      setParseError("That file has no worksheets.");
      return;
    }
    setWorkbook(wb);
    setSheetNames(wb.SheetNames);
    selectSheet(XLSX, wb, wb.SheetNames[0]!);
  }

  async function selectSheet(XLSXMod: typeof import("xlsx"), wb: import("xlsx").WorkBook, sheet: string) {
    setSelectedSheet(sheet);
    const hs = readHeaders(XLSXMod, wb.Sheets[sheet]!);
    setHeaders(hs);
    const suggestion = suggestMapping(hs);
    setMapping({ ...suggestion.fields, notes: suggestion.notes });
  }

  async function onSheetChange(sheet: string) {
    if (!workbook) return;
    const XLSX = await import("xlsx");
    selectSheet(XLSX, workbook, sheet);
  }

  function setField(key: ImportFieldKey, header: string) {
    setMapping((m) => ({ ...m, [key]: header === NONE ? undefined : header }));
  }

  function toggleNote(header: string, checked: boolean) {
    setMapping((m) => ({
      ...m,
      notes: checked ? [...m.notes, header] : m.notes.filter((h) => h !== header),
    }));
  }

  const canImport = !!file && !!selectedSheet && !!mapping.date && !!mapping.phone;

  async function submit() {
    if (!file || !canImport) return;
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("sheet", selectedSheet);
      body.set("mapping", JSON.stringify(mapping));
      body.set("defaultSourceKey", sourceKey);
      const res = await apiFetch<ImportResult>("/api/inquiries/import", { method: "POST", body });
      setResult(res);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSection(kind: "Errors" | "Warnings", rows: { row: number; message: string }[]) {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => ({ Row: r.row, Message: r.message })),
      { header: ["Row", "Message"] },
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, kind);
    XLSX.writeFile(wb, `inquiries-import-${kind.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="grid max-w-md gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="import-file">Excel file</Label>
          <input
            id="import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            className="border-input file:bg-secondary file:text-secondary-foreground rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:px-2 file:py-1 file:text-xs"
          />
          {parseError ? <p className="text-destructive text-sm">{parseError}</p> : null}
        </div>

        {sheetNames.length > 0 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="import-sheet">Worksheet</Label>
            <Select value={selectedSheet} onValueChange={onSheetChange}>
              <SelectTrigger id="import-sheet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheetNames.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {headers.length > 0 ? (
        <div className="max-w-xl space-y-4 rounded-md border p-4">
          <p className="text-sm font-medium">Map columns</p>
          <p className="text-muted-foreground text-xs">
            We've guessed a mapping from “{selectedSheet}”'s columns — check it and change anything
            that's wrong. Date and Phone Number are required; everything else gets a sensible default
            if left unmapped.
          </p>

          <div className="grid gap-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key} className="grid grid-cols-[9rem_1fr] items-center gap-2">
                <Label htmlFor={`map-${f.key}`}>
                  {f.label}
                  {f.required ? <span className="text-primary"> *</span> : null}
                </Label>
                <Select value={mapping[f.key] ?? ""} onValueChange={(v) => setField(f.key, v)}>
                  <SelectTrigger id={`map-${f.key}`}>
                    <SelectValue placeholder="Not mapped" />
                  </SelectTrigger>
                  <SelectContent>
                    {!f.required ? <SelectItem value={NONE}>— none —</SelectItem> : null}
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            <div className="grid grid-cols-[9rem_1fr] gap-2">
              <Label>Notes</Label>
              <div className="grid gap-1.5">
                <p className="text-muted-foreground text-xs">
                  Pick any columns to combine into the inquiry's Notes.
                </p>
                {headers.map((h) => (
                  <label key={h} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={mapping.notes.includes(h)}
                      onChange={(e) => toggleNote(h, e.target.checked)}
                      className="size-4 shrink-0"
                    />
                    {h}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-1.5 border-t pt-4">
            <Label htmlFor="import-source">Default source (when Source is blank or unrecognized)</Label>
            <Select value={sourceKey} onValueChange={setSourceKey}>
              <SelectTrigger id="import-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={submit} disabled={!canImport || busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            Import
          </Button>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>
              <strong>{result.totalRows}</strong> rows
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              <strong>{result.created}</strong> created
            </span>
            <span className="text-sky-600 dark:text-sky-400">
              <strong>{result.matched}</strong> matched existing
            </span>
            <span className="text-destructive flex items-center gap-1">
              <strong>{result.errors.length}</strong> errors
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:text-destructive"
                title="Download errors as Excel"
                onClick={() => downloadSection("Errors", result.errors)}
              >
                <DownloadIcon />
              </Button>
            </span>
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <strong>{result.warnings.length}</strong> warnings
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-amber-600 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400"
                title="Download warnings as Excel"
                onClick={() => downloadSection("Warnings", result.warnings)}
              >
                <DownloadIcon />
              </Button>
            </span>
          </div>
          {result.errors.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Errors</p>
              <ul className="text-destructive max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.warnings.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Warnings</p>
              <ul className="text-muted-foreground max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
