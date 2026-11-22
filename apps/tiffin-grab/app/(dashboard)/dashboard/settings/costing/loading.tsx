import { CalculatorIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { SettingsPageFrame } from "../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame icon={CalculatorIcon} title="Costing">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Costs and margins</CardTitle>
            <CardDescription>Used by Analytics → Profitability and by staff pricing in Estimate and New order.</CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How cost is worked out</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    </SettingsPageFrame>
  );
}
