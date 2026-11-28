import { runAction } from "@foundry/console/run-action";
import { EXPIRY_PRESETS } from "@foundry/collab/limits";
import { Button } from "@foundry/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@foundry/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useRouter } from "@tanstack/react-router";
import { Settings2Icon } from "lucide-react";
import { errorText } from "../../lib/error-copy";
import { setDefaultTtlFn } from "../../lib/meeting-docs/meeting-docs.fns";
import { presetLabel } from "./expiry-select";

export function DocSettings({ docId, seconds }: { docId: string; seconds: number }) {
  const router = useRouter();
  const save = (next: number) =>
    void runAction(() => setDefaultTtlFn({ data: { docId, seconds: next } }), "Default expiry saved", () => router.invalidate(), errorText);
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="icon" aria-label="Doc settings" />}>
        <Settings2Icon aria-hidden className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-64 gap-2">
        <PopoverTitle>Default link expiry</PopoverTitle>
        <Select value={String(seconds)} onValueChange={(v) => v && save(Number(v))}>
          <SelectTrigger aria-label="Default link expiry" className="w-full">
            <SelectValue>{presetLabel(seconds)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EXPIRY_PRESETS.map((p) => (
              <SelectItem key={p.seconds} value={String(p.seconds)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  );
}
