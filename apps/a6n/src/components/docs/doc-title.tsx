import { runAction } from "@foundry/console/run-action";
import { Input } from "@foundry/ui/input";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { renameDocFn } from "../../lib/docs/docs.fns";
import { errorText } from "../../lib/error-copy";

/** The owner's title field: saved on Enter or when focus leaves it. */
export function DocTitle({ docId, title }: { docId: string; title: string }) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);

  function save() {
    const next = value.trim();
    if (!next || next === title) return setValue(title);
    void runAction(() => renameDocFn({ data: { docId, title: next } }), "Title saved", () => router.invalidate(), errorText);
  }

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <Input
        aria-label="Doc title"
        maxLength={200}
        value={value}
        className="h-11 w-full border-transparent px-1 text-3xl font-semibold tracking-tight hover:border-input md:text-3xl"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </>
  );
}
