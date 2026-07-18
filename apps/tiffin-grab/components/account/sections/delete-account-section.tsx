import { SectionCard } from "@/components/ds";
import { DeleteAccountForm } from "@/components/account/leaves/delete-account-form";

export function DeleteAccountSection({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="delete-account" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        titleAs={titleAs}
        title="Delete account"
        subtitle="Permanently close your account. Your sign-in is removed and this can't be undone."
      >
        <DeleteAccountForm />
      </SectionCard>
    </section>
  );
}
