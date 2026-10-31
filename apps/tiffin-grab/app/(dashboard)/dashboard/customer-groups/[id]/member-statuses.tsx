"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { TableCell } from "@foundry/ui/table";
import { DataTable } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Badge } from "@/components/reui/badge";
import { UsersIcon } from "lucide-react";
import { emailAwardedMembersAction, getCoinsActionMembersAction } from "../actions";

type Status = { publicId: string; name: string | null; email: string | null; status: "awarded" | "capped" };

const COLUMNS = [
  { key: "name", label: "Customer" },
  { key: "email", label: "Email" },
  { key: "status", label: "Result" },
] as const;

export function MemberStatuses({ actionPublicId }: { actionPublicId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Status[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const res = await getCoinsActionMembersAction(actionPublicId);
      if (res.ok) setRows(res.data);
      else setError(res.error);
    } catch {
      setError("Could not load the member results.");
    }
  }, [actionPublicId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function emailAwarded() {
    setEmailing(true);
    setEmailError(null);
    try {
      const res = await emailAwardedMembersAction(actionPublicId);
      if (res.ok) router.push(`/dashboard/notifications/campaigns/${res.data.campaignPublicId}?step=content`);
      else setEmailError(res.error);
    } catch {
      setEmailError("Could not create the campaign.");
    } finally {
      setEmailing(false);
    }
  }

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-2">
          {error}
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  if (!rows) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        emptyIcon={UsersIcon}
        emptyMessage="No members were recorded for this action."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.name ?? "Unnamed"}</TableCell>
            <TableCell className="text-muted-foreground">{r.email ?? ""}</TableCell>
            <TableCell>
              {r.status === "awarded" ? (
                <Badge variant="success-light">Awarded</Badge>
              ) : (
                <Badge variant="warning-light">Blocked by cap</Badge>
              )}
            </TableCell>
          </>
        )}
      />
      {emailError && (
        <Alert variant="destructive">
          <AlertDescription>{emailError}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button variant="outline" onClick={emailAwarded} disabled={emailing || !rows.some((r) => r.status === "awarded")}>
          <MailIcon /> {emailing ? "Creating campaign..." : "Email awarded members"}
        </Button>
      </div>
    </div>
  );
}
