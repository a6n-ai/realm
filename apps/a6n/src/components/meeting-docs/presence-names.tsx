import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";

type Person = { key: string; name: string; color: string; you: boolean };

function people(awareness: Awareness): Person[] {
  const seen = new Map<string, Person>();
  for (const [clientId, state] of awareness.getStates()) {
    const user = (state as { user?: { name?: unknown; color?: unknown } }).user;
    // awareness is client-supplied, so take only well-formed entries
    if (typeof user?.name !== "string" || typeof user.color !== "string") continue;
    const key = `${user.name}|${user.color}`;
    seen.set(key, { key, name: user.name, color: user.color, you: clientId === awareness.clientID || Boolean(seen.get(key)?.you) });
  }
  return [...seen.values()].sort((a, b) => Number(b.you) - Number(a.you));
}

/** Everyone in the doc, by full name. The foundry avatars show only initials. */
export function PresenceNames({ provider }: { provider: { awareness: Awareness } }) {
  const [list, setList] = useState<Person[]>([]);
  useEffect(() => {
    const read = () => setList(people(provider.awareness));
    read();
    provider.awareness.on("change", read);
    return () => provider.awareness.off("change", read);
  }, [provider]);

  if (!list.length) return null;
  return (
    <ul aria-label="In this doc" className="flex flex-wrap gap-2">
      {list.map((p) => (
        <li key={p.key} className="flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="truncate">{p.name}</span>
          {p.you ? <span className="text-muted-foreground">(you)</span> : null}
        </li>
      ))}
    </ul>
  );
}
