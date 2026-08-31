"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { useIsMobile } from "@realm/ui/use-mobile";

export function SearchInput({
  value, onChange, placeholder = "Search…", shortPlaceholder, debounceMs = 0,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // Shorter placeholder shown at mobile widths (<sm) where the full one truncates.
  shortPlaceholder?: string;
  // When > 0, defer onChange until the user pauses typing. Lets server-search
  // tables avoid a refetch per keystroke. Falsy/0 => immediate (legacy behavior).
  debounceMs?: number;
}) {
  const isMobile = useIsMobile();
  const ph = isMobile && shortPlaceholder ? shortPlaceholder : placeholder;
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

  const [focused, setFocused] = useState(false);

  return (
    <div
      className={cn(
        // rounded-lg + border-input + ring-3 matches this app's Input/Select/Button
        // radius and focus treatment exactly (packages/ui/src/input.tsx) — a pill
        // shape read as a foreign component next to every other bordered control.
        "bg-background relative flex h-11 items-center rounded-lg border border-input transition-colors sm:h-9",
        focused && "border-ring ring-3 ring-ring/50",
      )}
    >
      <SearchIcon
        className={cn(
          "pointer-events-none absolute left-2.5 size-4 shrink-0 transition-colors duration-150",
          focused || draft ? "text-foreground" : "text-muted-foreground",
        )}
      />
      <input
        value={draft}
        onChange={(e) => emit(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={ph}
        className="placeholder:text-muted-foreground w-full min-w-0 rounded-lg bg-transparent py-1 pr-8 pl-8 text-sm outline-none"
      />
      {draft && (
        <button
          type="button"
          onClick={clear}
          className="text-muted-foreground hover:text-foreground hover:bg-muted absolute right-1.5 grid size-6 shrink-0 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label="Clear search"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
