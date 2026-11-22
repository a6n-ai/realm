import { HelpCircleIcon } from "lucide-react";
import { SettingsPageFrame } from "../../_skeletons";
import { FaqManagerSkeleton } from "./manager";

export default function Loading() {
  return (
    <SettingsPageFrame icon={HelpCircleIcon} title="FAQ" subtitle="Questions and answers shown on the public /faq page.">
      <FaqManagerSkeleton />
    </SettingsPageFrame>
  );
}
