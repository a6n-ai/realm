"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { runCronJobAction } from "./actions";

export function RunNowButton({ job }: { job: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runCronJobAction(job);
          if ("error" in res) toast.error(res.error);
          else toast.success(res.message ?? "Job finished");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
      {pending ? "Running…" : "Run now"}
    </Button>
  );
}
