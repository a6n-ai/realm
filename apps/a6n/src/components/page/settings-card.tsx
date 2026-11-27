import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@foundry/ui/card";
import type { ReactNode } from "react";

// Vercel's card: title row with a hairline under it, the body, then a muted footer strip (hint left, action right).
export function SettingsCard({
  title,
  description,
  footer,
  action,
  children,
}: {
  title: string;
  description?: string;
  footer?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader divided={Boolean(children)}>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      {footer || action ? (
        <CardFooter className="flex-wrap justify-between gap-3">
          <div className="min-w-0 text-sm text-muted-foreground">{footer}</div>
          {action ? <div className="ml-auto">{action}</div> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
