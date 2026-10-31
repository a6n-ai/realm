"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { searchAccounts } from "../actions";

export type AccountResult = Awaited<ReturnType<typeof searchAccounts>>[number];

export function AccountSearch({
  placeholder,
  onPick,
  exclude,
}: {
  placeholder: string;
  onPick: (a: AccountResult) => void;
  exclude?: Set<string>;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<AccountResult[] | null>(null);
  const [pending, start] = React.useTransition();

  const find = () =>
    start(async () => {
      try {
        setResults(await searchAccounts(query));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      }
    });

  const shown = results?.filter((r) => !exclude?.has(r.publicId));

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} className="w-72" />
        <Button type="submit" size="sm" variant="outline" disabled={pending || query.trim().length < 2}>
          {pending ? "Searching..." : "Search"}
        </Button>
      </form>
      {shown && (
        <div className="max-w-xl rounded-lg border">
          {shown.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">No customers found.</p>
          ) : (
            shown.map((r) => (
              <button
                key={r.publicId}
                type="button"
                className="hover:bg-muted flex w-full items-center justify-between gap-2 border-b p-2 text-left text-sm transition-colors last:border-b-0"
                onClick={() => {
                  onPick(r);
                  setResults(null);
                  setQuery("");
                }}
              >
                <span className="font-medium">{r.fullName ?? "Customer"}</span>
                <span className="text-muted-foreground">{r.phone ?? r.email}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
