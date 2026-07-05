"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@realm/ui/input";

export function SearchInput({
  value, onChange, placeholder = "Search…", debounceMs = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // When > 0, defer onChange until the user pauses typing. Lets server-search
  // tables avoid a refetch per keystroke. Falsy/0 => immediate (legacy behavior).
  debounceMs?: number;
}) {
  // Internal draft so the input stays responsive while onChange is debounced.
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the draft in sync when the owner changes the value out-of-band
  // (e.g. a "Clear filters" button setting it back to "").
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const emit = (v: string) => {
    setDraft(v);
    if (debounceMs > 0) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onChange(v), debounceMs);
    } else {
      onChange(v);
    }
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setDraft("");
    onChange(""); // clearing is always immediate
  };

  return (
    <div className="relative">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
      <Input value={draft} onChange={(e) => emit(e.target.value)} placeholder={placeholder} className="pl-8 pr-8" />
      {draft && (
        <button type="button" onClick={clear} className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none" aria-label="Clear search">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
