import { saveGeneralSettings } from "@/lib/settings";
import { rebaseOpenCutoffs } from "./cutoff-rebase";

export async function setAppSettings(input: Parameters<typeof saveGeneralSettings>[0]): Promise<void> {
  await saveGeneralSettings(input);
  await rebaseOpenCutoffs(input.cutoffHour, input.timezone);
}
