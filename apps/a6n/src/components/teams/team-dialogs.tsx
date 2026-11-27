import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { errorText } from "../../lib/error-copy";
import type { TeamRow } from "../../lib/teams/service";
import { addTeamMemberFn, createTeamFn, removeTeamMemberFn, renameTeamFn } from "../../lib/teams/teams.fns";
import { ResponsiveDialog } from "../responsive-dialog";

export function TeamNameDialog({ team, onClose }: { team: TeamRow | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(team?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = team ? await renameTeamFn({ data: { id: team.id, name } }) : await createTeamFn({ data: { name } });
      if (!res.ok) return setError(errorText(new Error(res.code)));
      toast.success(team ? "Team renamed" : `Team ${name.trim()} created`);
      onClose();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={team ? `Rename ${team.name}` : "Create team"}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="team-name">Name</Label>
          <Input id="team-name" required maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {team ? "Save name" : "Create team"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

// Each tick saves at once, like Vercel's team member pickers.
export function TeamMembersDialog({ team, people, onClose }: { team: TeamRow; people: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [inTeam, setInTeam] = useState(new Set(team.members.map((m) => m.userId)));

  async function toggle(userId: string, on: boolean) {
    try {
      const res = on
        ? await addTeamMemberFn({ data: { teamId: team.id, userId } })
        : await removeTeamMemberFn({ data: { teamId: team.id, userId } });
      if (!res.ok) return void toast.error(errorText(new Error(res.code)));
      setInTeam((s) => {
        const next = new Set(s);
        if (on) next.add(userId);
        else next.delete(userId);
        return next;
      });
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={`Members of ${team.name}`}>
      <ul className="grid gap-2">
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={inTeam.has(p.id)} onCheckedChange={(on) => void toggle(p.id, on === true)} />
              {p.name}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
