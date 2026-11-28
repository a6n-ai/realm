import { runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { removeMemberFn, setMemberFn } from "../../lib/docs/docs.fns";
import type { MemberGrant } from "../../lib/docs/service";
import { errorText } from "../../lib/error-copy";
import { MODE_LABEL } from "../meeting-docs/share-dialog";

type Mode = MemberGrant["mode"];

function ModeSelect({ label, value, onChange }: { label: string; value: Mode; onChange: (mode: Mode) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && v !== value && onChange(v === "view" ? "view" : "edit")}>
      <SelectTrigger aria-label={label} className="min-w-28">
        <SelectValue>{MODE_LABEL[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(["edit", "view"] as const).map((m) => (
          <SelectItem key={m} value={m}>
            {MODE_LABEL[m]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PeopleSection({ docId, grants, candidates }: { docId: string; grants: MemberGrant[]; candidates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [person, setPerson] = useState("");
  const [mode, setMode] = useState<Mode>("edit");
  const refresh = () => router.invalidate();
  const set = (userId: string, next: Mode, done: string) =>
    runAction(() => setMemberFn({ data: { docId, userId, mode: next } }), done, refresh, errorText);

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">Add people</h3>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={person} onValueChange={(v) => setPerson(v ?? "")}>
          <SelectTrigger aria-label="Member" className="min-w-40 flex-1">
            <SelectValue>{candidates.find((c) => c.id === person)?.name ?? (candidates.length ? "Choose a member" : "No one left to add")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ModeSelect label="Access for the new person" value={mode} onChange={setMode} />
        <Button
          disabled={!candidates.some((c) => c.id === person)}
          onClick={() => {
            setPerson("");
            void set(person, mode, "Person added");
          }}
        >
          Add
        </Button>
      </div>
      {grants.length ? (
        <ul className="divide-y rounded-lg border">
          {grants.map((g) => (
            <li key={g.userId} className="flex flex-wrap items-center gap-2 p-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name}</span>
              <ModeSelect label={`Access for ${g.name}`} value={g.mode} onChange={(next) => void set(g.userId, next, "Access changed")} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runAction(() => removeMemberFn({ data: { docId, userId: g.userId } }), "Person removed", refresh, errorText)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
