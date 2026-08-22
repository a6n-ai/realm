"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Textarea } from "@realm/ui/textarea";
import { EmailEditorField, apiFetch, type EmailEditorFieldHandle } from "@realm/notifications/ui";
import { AudienceBuilder, type AudienceValue, type ContactListOption } from "./audience-builder";

const CHANNELS = [
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "whatsapp", label: "WhatsApp" },
] as const;

type ChannelKey = (typeof CHANNELS)[number]["key"];

// materializeCampaign puts the recipient's name and CSV merge fields under
// `contact`, so those are the variables a campaign template can resolve.
const CAMPAIGN_VARIABLES = ["contact.name"];

export function CampaignComposer({ lists }: { lists: ContactListOption[] }) {
  const router = useRouter();
  const editor = useRef<EmailEditorFieldHandle>(null);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ChannelKey>("email");
  const [subject, setSubject] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [audience, setAudience] = useState<AudienceValue>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name the campaign");
    if (!subject.trim()) return toast.error("Add a subject");
    setSaving(true);
    try {
      const created = await apiFetch<{ publicId: string }>("/api/notifications/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, channels: [channel], audience }),
      });

      const content: Record<string, unknown> = { channel, locale: "en", subject };
      if (channel === "email") {
        const exported = await editor.current?.exportEmail();
        Object.assign(content, {
          body: exported?.body ?? "",
          html: exported?.html ?? "",
          text: exported?.text ?? "",
        });
      } else {
        Object.assign(content, { body: smsBody, providerTemplateId: templateId || undefined });
      }

      await apiFetch(`/api/notifications/campaigns/${created.publicId}/content`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(content),
      });

      toast.success("Campaign saved as a draft");
      router.push(`/dashboard/notifications/campaigns/${created.publicId}`);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="name">Campaign name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring menu" />
      </div>

      <div className="space-y-2">
        <Label>Channel</Label>
        <div className="flex gap-2">
          {CHANNELS.map((c) => (
            <Button
              key={c.key}
              type="button"
              size="sm"
              variant={channel === c.key ? "default" : "outline"}
              onClick={() => setChannel(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject">{channel === "email" ? "Subject" : "Title"}</Label>
        <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      {channel === "email" ? (
        <div className="space-y-1.5">
          <Label>Message</Label>
          {/* Campaign copy is free-form, so the only merge vars offered are the
              contact fields the CSV importer lifts. */}
          <EmailEditorField ref={editor} initialHtml="" variables={CAMPAIGN_VARIABLES} />
          <p className="text-xs text-muted-foreground">
            An unsubscribe link, the sender name and the postal address are appended automatically —
            they are legally required and cannot be removed from the copy.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="smsBody">Message</Label>
            <Textarea id="smsBody" rows={4} value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="templateId">Provider template id</Label>
            <Input id="templateId" value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
            {/* Outside Meta's 24-hour customer-service window every WhatsApp
                message must use a template approved in advance, so this field
                is the content — not the box above. */}
            <p className="text-xs text-muted-foreground">
              WhatsApp messages sent outside the 24-hour reply window must use a template Meta has
              approved in advance. Enter its id here; the text above is the preview.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Audience</Label>
        <AudienceBuilder
          lists={lists}
          value={audience}
          onChange={setAudience}
          requiresVerifiedPhone={channel === "sms" || channel === "whatsapp"}
        />
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save draft"}
      </Button>
    </div>
  );
}
