"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import type { CronJob } from "@/lib/cron/jobs";
import { runCronJobAction } from "./actions";

const DATE_HINT: Record<NonNullable<CronJob["inputs"]>, string> = {
  date: "Leave empty to pull yesterday and today",
  sync: "Leave empty for tomorrow",
};

export function RunNowButton({ job, inputs }: { job: string; inputs?: CronJob["inputs"] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [mode, setMode] = useState<"push" | "pull">("push");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {inputs === "sync" && (
        <Select value={mode} onValueChange={(v) => setMode(v as "push" | "pull")}>
          <SelectTrigger className="h-8 w-36" aria-label="Direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="push">Push stops</SelectItem>
            <SelectItem value="pull">Pull routes</SelectItem>
          </SelectContent>
        </Select>
      )}
      {inputs && (
        <Input
          type="date"
          aria-label="Date"
          title={DATE_HINT[inputs]}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 w-40"
        />
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await runCronJobAction(job, { date, mode: inputs === "sync" ? mode : undefined });
            if ("error" in res) toast.error(res.error);
            else toast.success(res.message ?? "Job finished");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
        {pending ? "Running…" : "Run now"}
      </Button>
    </div>
  );
}
