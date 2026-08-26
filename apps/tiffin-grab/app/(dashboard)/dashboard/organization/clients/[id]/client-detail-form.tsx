export function ClientDetailForm({
  organization,
}: {
  organization: { name: string; clientCode: string; region: string | null };
}) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt className="text-muted-foreground">Name</dt>
      <dd>{organization.name}</dd>
      <dt className="text-muted-foreground">Client code</dt>
      <dd>{organization.clientCode}</dd>
      <dt className="text-muted-foreground">Region</dt>
      <dd>{organization.region ?? "—"}</dd>
    </dl>
  );
}
