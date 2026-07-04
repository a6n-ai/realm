"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@realm/ui/switch";
import { Label } from "@realm/ui/label";
import { SectionCard } from "@/components/ds";
import { updateMyPreferences } from "@/app/(dashboard)/dashboard/account/actions";

type Channel = "email" | "sms";

export function NotificationsSection({
  notifyEmail,
  notifySms,
  titleAs,
}: {
  notifyEmail: boolean;
  notifySms: boolean;
  titleAs?: "h2" | "h3";
}) {
  const [email, setEmail] = useState(notifyEmail);
  const [sms, setSms] = useState(notifySms);
  const [pending, startTransition] = useTransition();

  function toggle(channel: Channel, next: boolean) {
    const prevEmail = email;
    const prevSms = sms;
    const nextEmail = channel === "email" ? next : email;
    const nextSms = channel === "sms" ? next : sms;

    if (channel === "email") setEmail(next);
    else setSms(next);

    startTransition(async () => {
      try {
        await updateMyPreferences({ notifyEmail: nextEmail, notifySms: nextSms });
        toast.success(
          next
            ? `${channel === "email" ? "Email" : "SMS"} notifications on.`
            : `${channel === "email" ? "Email" : "SMS"} notifications off.`,
        );
      } catch (e) {
        setEmail(prevEmail);
        setSms(prevSms);
        toast.error(e instanceof Error ? e.message : "Failed to update notifications.");
      }
    });
  }

  return (
    <section id="notifications" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        titleAs={titleAs}
        title="Notifications"
        subtitle="Choose how we reach you about orders and account updates."
      >
        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="grid gap-0.5">
              <Label htmlFor="notify-email" className="text-sm font-medium">
                Email
              </Label>
              <p className="text-muted-foreground text-sm text-pretty">
                Order confirmations, receipts, and important updates.
              </p>
            </div>
            <Switch
              id="notify-email"
              checked={email}
              disabled={pending}
              onCheckedChange={(v) => toggle("email", v)}
              aria-label="Email notifications"
            />
          </div>
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="grid gap-0.5">
              <Label htmlFor="notify-sms" className="text-sm font-medium">
                SMS
              </Label>
              <p className="text-muted-foreground text-sm text-pretty">
                Text alerts when your tiffin is out for delivery.
              </p>
            </div>
            <Switch
              id="notify-sms"
              checked={sms}
              disabled={pending}
              onCheckedChange={(v) => toggle("sms", v)}
              aria-label="SMS notifications"
            />
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
