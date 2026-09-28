"use client";

import type { ButtonHTMLAttributes, ComponentProps, ComponentType, ReactNode } from "react";
import { Button, Field, Notice, OptionCard, PillToggle, Reason, Segmented, Sheet, Skeleton } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import { WeekStrip } from "../week-strip";
import { CategorySection, ChoiceRow } from "./choice-row";

/**
 * How the delivery action sheets (Edit meal, Move, Change address) look. The sheets own every
 * rule and server call; this only swaps the primitives they render. The customer app uses the
 * kit (KIT_UI, the default); the admin order page passes shadcn equivalents, so staff and
 * customers run the exact same logic and can never drift.
 */
export type SheetUi = {
  Shell: ComponentType<{ open: boolean; onClose: () => void; title: string; footer: ReactNode; children: ReactNode }>;
  /** The footer's one action. `disabledReason` disables it and says why. */
  PrimaryButton: ComponentType<{ pending: boolean; disabled?: boolean; disabledReason?: string; onClick: () => void; children: ReactNode }>;
  Notice: ComponentType<{ tone?: "info" | "error"; children: ReactNode }>;
  Reason: ComponentType<{ children: ReactNode }>;
  Loading: ComponentType;
  Segmented: ComponentType<{ label: string; idPrefix: string; value: string | undefined; onChange: (v: string) => void; items: { id: string; label: string }[] }>;
  ChoiceRow: typeof ChoiceRow;
  CategorySection: typeof CategorySection;
  WeekStrip: ComponentType<ComponentProps<typeof WeekStrip>>;
  OptionCard: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }>;
  PillToggle: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }>;
  Field: ComponentType<{ label: string; placeholder?: string; maxLength?: number; value: string; error?: string; onChange: (e: { target: { value: string } }) => void }>;
  AddressFields: ComponentType<ComponentProps<typeof AddressFields>>;
};

export const KIT_UI: SheetUi = {
  Shell: ({ open, onClose, title, footer, children }) => <Sheet open={open} onClose={onClose} title={title} footer={footer}>{children}</Sheet>,
  PrimaryButton: ({ pending, disabled, disabledReason, onClick, children }) => (
    <Button variant="primary" size="lg" className="w-full" pending={pending} disabled={disabled} disabledReason={disabledReason} onClick={onClick}>
      {children}
    </Button>
  ),
  Notice,
  Reason,
  Loading: () => (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading menu">
      <Skeleton className="h-11 w-full rounded-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[72px] w-full rounded-[20px]" />
      ))}
    </div>
  ),
  Segmented: (p) => <Segmented {...p} value={p.value ?? ""} />,
  ChoiceRow,
  CategorySection,
  WeekStrip,
  OptionCard,
  PillToggle,
  Field,
  AddressFields,
};

export const useSheetUi = (ui?: Partial<SheetUi>): SheetUi => (ui ? { ...KIT_UI, ...ui } : KIT_UI);
