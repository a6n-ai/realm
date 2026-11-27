import { confirmAction } from "@foundry/console/run-action";
import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { PhoneInput } from "@foundry/ui/phone-input";
import { Textarea } from "@foundry/ui/textarea";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { fromDateInput, tomorrowInput } from "../../lib/dates";
import { DEFAULT_COUNTRY } from "../../lib/phone";
import { errorText } from "../../lib/error-copy";
import { createInquiryFn } from "../../lib/inquiries/inquiries.fns";
import type { SourceRow, SubsourceRow } from "../../lib/inquiries/sources";
import { ResponsiveDialog } from "../responsive-dialog";
import { CompanyCombobox } from "./company-combobox";
import { SourcePills } from "./source-pills";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceRow[];
  subsources: SubsourceRow[];
};

function NewInquiryForm({ sources, subsources, onDone }: Pick<Props, "sources" | "subsources"> & { onDone: () => void }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [pick, setPick] = useState<{ source: string | null; subSource: string | null }>({ source: null, subSource: null });
  const [requirements, setRequirements] = useState("");
  const [followUp, setFollowUp] = useState(() => tomorrowInput());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nextFollowUpAt = fromDateInput(followUp);
    if (!contactName.trim() && !phone.trim()) return setError("Enter a contact name or a phone number.");
    if (!pick.source) return setError("Pick a source.");
    if (nextFollowUpAt === null) return setError("Pick a follow-up date.");
    setError(null);
    setPending(true);
    let id: string | undefined;
    try {
      await confirmAction(
        async () => {
          const res = await createInquiryFn({ data: { source: pick.source!, subSource: pick.subSource, contactName, phone, email, company, requirements, nextFollowUpAt } });
          if (res.ok) id = res.id;
          return res;
        },
        "Inquiry created",
        () => router.invalidate(),
        errorText,
      );
      onDone();
      if (id) await navigate({ to: "/inquiries/$id", params: { id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ni-name">Contact name</Label>
          <Input id="ni-name" value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ni-phone">Phone</Label>
          <PhoneInput id="ni-phone" defaultCountry={DEFAULT_COUNTRY} value={phone} onChange={setPhone} autoComplete="off" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ni-email">Email</Label>
        <Input id="ni-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ni-company">Company</Label>
        <CompanyCombobox id="ni-company" value={company} onChange={setCompany} />
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Source</span>
        <SourcePills sources={sources} subsources={subsources} source={pick.source} subSource={pick.subSource} onChange={setPick} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ni-req">Requirements</Label>
        <Textarea id="ni-req" rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ni-follow">Follow-up date</Label>
        <Input id="ni-follow" type="date" required value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
      </div>
      <FormError error={error} />
      <Button type="submit" disabled={pending}>
        Create inquiry
      </Button>
    </form>
  );
}

export function NewInquiryDialog({ open, onOpenChange, sources, subsources }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="New inquiry">
      <NewInquiryForm sources={sources} subsources={subsources} onDone={() => onOpenChange(false)} />
    </ResponsiveDialog>
  );
}
