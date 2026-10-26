import { Camera, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { StepList } from "@/components/customer/kit";

/** The three steps of a support chat, in the same step list as Refer's "How it works". */
export function HowSupportWorks() {
  return (
    <section aria-labelledby="support-how" className="space-y-3">
      <h2 id="support-how" className="text-[17px] font-semibold">How support works</h2>
      <StepList
        steps={[
          { icon: <MessageSquarePlus />, tint: "cyan", title: "Pick a topic", body: "Choose what it's about, or tap New ticket." },
          { icon: <Camera />, tint: "purple", title: "Tell us what happened", body: "Add the order and a photo if it helps us see it." },
          { icon: <MessagesSquare />, tint: "mint", title: "We reply right here", body: "Your chat stays on this page, with every reply." },
        ]}
      />
    </section>
  );
}
