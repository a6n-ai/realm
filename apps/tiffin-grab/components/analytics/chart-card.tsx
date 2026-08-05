import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ds";

// Shared "titled panel around a chart or list" wrapper so every analytics
// tab's sections line up the same way.
export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
