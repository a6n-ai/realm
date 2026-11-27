import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@foundry/ui/card";
import type { ReactNode } from "react";

// Vercel's card: title row with a hairline under it, the body, then an optional muted footer strip.
export function SettingsCard({ title, description, footer, children }: { title: string; description?: string; footer?: ReactNode; children?: ReactNode }) {
  return (
    <Card>
      <CardHeader divided={Boolean(children)}>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      {footer ? <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter> : null}
    </Card>
  );
}
