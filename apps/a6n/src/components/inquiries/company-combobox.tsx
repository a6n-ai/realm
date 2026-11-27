import { Input } from "@foundry/ui/input";
import { useEffect, useId, useState } from "react";
import { comboKey } from "./combobox-keys";
import { searchCompaniesFn } from "../../lib/inquiries/inquiries.fns";

// Free text is allowed: a name that matches no company creates one when the inquiry is saved.
export function CompanyCombobox({ value, onChange, id }: { value: string; onChange: (name: string) => void; id?: string }) {
  const listId = useId();
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

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
  const optId = (i: number) => `${listId}-${i}`;
  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const r = comboKey(e.key, active, options.length, shown);
    if (!r) return;
    e.preventDefault();
    setActive(r.active);
    setOpen(r.open);
    if (r.select) pick(options[r.active].name);
  };
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? optId(active) : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {shown ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={optId(i)}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.name);
              }}
              className="cursor-default rounded-sm px-2 py-1.5 text-sm hover:bg-muted aria-selected:bg-muted"
            >
              {o.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
