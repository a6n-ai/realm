import Link from "next/link";
import { ArrowLeftIcon, UploadIcon } from "lucide-react";
import { PageHeader } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Card } from "@foundry/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { ContactListUpload } from "@relay/engine/ui";

export const dynamic = "force-dynamic";

export default async function ContactListImportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader
        icon={UploadIcon}
        title="Import a list"
        subtitle="CSV. Preview and pick which contacts to keep before anything is saved."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/notifications/contact-lists">
              <ArrowLeftIcon />
              Back to contact lists
            </Link>
          </Button>
        }
      />
      <Card className="p-4">
        <ContactListUpload />
      </Card>
    </div>
  );
}
