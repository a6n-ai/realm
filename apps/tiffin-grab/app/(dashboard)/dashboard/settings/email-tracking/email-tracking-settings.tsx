"use client";

import { useState } from "react";
import { InfoIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { useIsMobile } from "@foundry/ui/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { SectionCard } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { ChooseEmailsButton, LoadErrorAlert, TrackedEmailsSummary, type EmailTypeRow } from "./email-tracking-section";
import type { saveStreamRouting } from "./actions";
import { trackedStatus } from "./event-names";
import { SesRoutingSection, type StreamState } from "./ses-routing-section";

const STEPS = [
  "Every email records when it was sent, delivered, bounced or marked as spam. You can see this in Notifications → Logs.",
  "For emails you choose, we also record when it was opened and when a link was clicked.",
  "Opens are a best guess — some mail apps load images automatically, others block them. Clicks are reliable.",
  "Login and security emails are never tracked, so they don't land in spam.",
];

export function EmailTrackingSettings({
  types,
  loadFailed,
  trackingAvailable,
  streams,
  onSaveTracked,
  onSaveRouting,
}: {
  types: EmailTypeRow[];
  loadFailed: boolean;
  trackingAvailable: boolean;
  streams: StreamState[];
  onSaveTracked: (events: string[]) => Promise<{ error?: string }>;
  onSaveRouting: typeof saveStreamRouting;
}) {
  const [tab, setTab] = useState("how");
  const isMobile = useIsMobile();
  const count = types.filter((t) => t.tracked).length;

  return (
    <Tabs value={tab} onValueChange={setTab} orientation={isMobile ? "horizontal" : "vertical"} className="flex-col gap-6 md:flex-row">
      <TabsList variant="line" className="max-md:w-full md:w-48 md:shrink-0" aria-label="Email tracking sections">
        <TabsTrigger value="how">How it works</TabsTrigger>
        <TabsTrigger value="tracked">Tracked emails</TabsTrigger>
        <TabsTrigger value="advanced">Advanced</TabsTrigger>
      </TabsList>
      <div className="min-w-0 flex-1">
        <TabsContent value="how">
          <SectionCard title="How email tracking works">
            <div className="flex flex-col gap-4">
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
                {STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              {!loadFailed && (
                <Alert variant="info">
                  <InfoIcon />
                  <AlertDescription>
                    {trackedStatus(count, trackingAvailable)}
                    {trackingAvailable && count > 0 && (
                      <Button variant="link" size="sm" onClick={() => setTab("tracked")}>
                        Change
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="tracked">
          <SectionCard
            title="Tracked emails"
            subtitle="Choose which emails also record opens and clicks."
            action={<ChooseEmailsButton types={types} onSave={onSaveTracked} disabled={loadFailed || !trackingAvailable} />}
          >
            {!trackingAvailable ? (
              <Alert variant="info">
                <AlertDescription>Open and click tracking isn&apos;t set up for this app yet. Ask your developer to enable it.</AlertDescription>
              </Alert>
            ) : loadFailed ? (
              <LoadErrorAlert message="Couldn't load your email settings." />
            ) : (
              <TrackedEmailsSummary types={types} />
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="advanced">
          <SectionCard title="Advanced" subtitle="Where each email event is sent. You don't need to change this.">
            <SesRoutingSection streams={streams} onSave={onSaveRouting} />
          </SectionCard>
        </TabsContent>
      </div>
    </Tabs>
  );
}
