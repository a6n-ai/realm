import { runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { fromDateInput, tomorrowInput } from "../../lib/dates";
import { errorText } from "../../lib/error-copy";
import { changeStageFn, reopenFn } from "../../lib/inquiries/inquiries.fns";
import { LOST_REASONS, OPEN_STAGES, STAGES, type LostReason, type Stage } from "../../lib/inquiries/stages";
import { LOST_LABEL, STAGE_LABEL } from "./labels";

function Reopen({ id }: { id: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("contacted");
  const [followUp, setFollowUp] = useState(() => tomorrowInput());
  const at = fromDateInput(followUp);
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label>Reopen at stage</Label>
        <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
          <SelectTrigger aria-label="Reopen at stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPEN_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reopen-follow">Next follow-up</Label>
        <Input id="reopen-follow" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </div>
      <Button
        disabled={at === null}
        onClick={() => runAction(() => reopenFn({ data: { id, stage: stage as (typeof OPEN_STAGES)[number], nextFollowUpAt: at! } }), "Inquiry reopened", () => router.invalidate(), errorText)}
      >
        Reopen inquiry
      </Button>
    </div>
  );
}

export function StageControl({ id, stage }: { id: string; stage: string }) {
  const router = useRouter();
  const [to, setTo] = useState<Stage | "">("");
  const [reason, setReason] = useState<LostReason | "">("");
  if (stage === "won" || stage === "lost") return <Reopen id={id} />;

  const ready = to !== "" && (to !== "lost" || reason !== "");
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <Label>Move to</Label>
        <Select value={to} onValueChange={(v) => setTo(v as Stage)}>
          <SelectTrigger aria-label="Move to stage">
            <SelectValue placeholder="Choose a stage" />
          </SelectTrigger>
          <SelectContent>
            {STAGES.filter((s) => s !== stage).map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {to === "lost" ? (
        <div className="grid gap-2">
          <Label>Lost reason</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
            <SelectTrigger aria-label="Lost reason">
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              {LOST_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {LOST_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <Button
        disabled={!ready}
        onClick={() =>
          runAction(
            () => changeStageFn({ data: { id, from: stage as Stage, to: to as Stage, lostReason: to === "lost" ? (reason as LostReason) : null } }),
            "Stage updated",
            async () => {
              setTo("");
              setReason("");
              await router.invalidate();
            },
            errorText,
          )
        }
      >
        Change stage
      </Button>
    </div>
  );
}
