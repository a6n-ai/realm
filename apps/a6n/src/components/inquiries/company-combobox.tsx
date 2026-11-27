import { Input } from "@foundry/ui/input";
import { useEffect, useId, useState } from "react";
import { searchCompaniesFn } from "../../lib/inquiries/inquiries.fns";

// Free text is allowed: a name that matches no company creates one when the inquiry is saved.
export function CompanyCombobox({ value, onChange, id }: { value: string; onChange: (name: string) => void; id?: string }) {
  const listId = useId();
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (!q) return setOptions([]);
    let live = true;
    const t = setTimeout(() => {
      searchCompaniesFn({ data: { q } }).then(
        (res) => live && setOptions(res ?? []),
        () => live && setOptions([]),
      );
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value]);

  const shown = open && options.some((o) => o.name !== value);
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      {shown ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((o) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.name === value}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.name);
                setOpen(false);
              }}
              className="cursor-default rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
            >
              {o.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
