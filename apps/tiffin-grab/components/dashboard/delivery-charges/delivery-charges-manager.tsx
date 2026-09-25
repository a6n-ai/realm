"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DollarSignIcon,
  HomeIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TruckIcon,
} from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foundry/ui/table";
import { SectionCard, ResponsiveDialog } from "@/components/ds";
import {
  updateBaseChargeAction,
  saveDeliveryTypeAction,
  deleteDeliveryTypeAction,
  saveAddressTagAction,
  deleteAddressTagAction,
} from "@/app/(dashboard)/dashboard/delivery/charges/actions";
import type {
  AddressTagDto,
  DeliveryChargeType,
  DeliveryTypeDto,
} from "@/lib/services/delivery-charges.service";

interface DeliveryChargesManagerProps {
  initialBaseCharge: number;
  initialDeliveryTypes: DeliveryTypeDto[];
  initialAddressTags: AddressTagDto[];
}

export function DeliveryChargesManager({
  initialBaseCharge,
  initialDeliveryTypes,
  initialAddressTags,
}: DeliveryChargesManagerProps) {
  const [baseCharge, setBaseCharge] = useState(initialBaseCharge);
  const [deliveryTypes, setDeliveryTypes] = useState(initialDeliveryTypes);
  const [addressTags, setAddressTags] = useState(initialAddressTags);

  // Dialog states
  const [baseChargeOpen, setBaseChargeOpen] = useState(false);
  const [deliveryTypeDialogOpen, setDeliveryTypeDialogOpen] = useState(false);
  const [editingDeliveryType, setEditingDeliveryType] = useState<DeliveryTypeDto | null>(null);
  const [addressTagDialogOpen, setAddressTagDialogOpen] = useState(false);
  const [editingAddressTag, setEditingAddressTag] = useState<AddressTagDto | null>(null);

  // Base Charge Form State
  const [baseChargeInput, setBaseChargeInput] = useState(initialBaseCharge.toFixed(2));
  const [isSavingBase, startSavingBase] = useTransition();

  const handleOpenBaseDialog = () => {
    setBaseChargeInput(baseCharge.toFixed(2));
    setBaseChargeOpen(true);
  };

  const handleSaveBaseCharge = () => {
    const val = Number(baseChargeInput);
    if (!Number.isFinite(val) || val < 0) {
      toast.error("Please enter a valid base charge (0 or greater).");
      return;
    }
    startSavingBase(async () => {
      try {
        const saved = await updateBaseChargeAction(val);
        setBaseCharge(saved);
        setBaseChargeOpen(false);
        toast.success("Base delivery charge updated.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update base charge.");
      }
    });
  };

  // Delivery Types Actions
  const handleOpenAddDeliveryType = () => {
    setEditingDeliveryType(null);
    setDeliveryTypeDialogOpen(true);
  };

  const handleOpenEditDeliveryType = (dt: DeliveryTypeDto) => {
    setEditingDeliveryType(dt);
    setDeliveryTypeDialogOpen(true);
  };

  const handleDeleteDeliveryType = (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove delivery type "${name}"?`)) return;
    void (async () => {
      try {
        const res = await deleteDeliveryTypeAction(id);
        if (res.deactivatedInstead) {
          toast.info(`"${name}" is referenced by existing orders or accounts and has been deactivated instead.`);
          setDeliveryTypes((prev) => prev.map((t) => (t.id === id ? { ...t, active: false } : t)));
        } else {
          toast.success(`"${name}" removed successfully.`);
          setDeliveryTypes((prev) => prev.filter((t) => t.id !== id));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete delivery type.");
      }
    })();
  };

  // Address Tags Actions
  const handleOpenAddAddressTag = () => {
    setEditingAddressTag(null);
    setAddressTagDialogOpen(true);
  };

  const handleOpenEditAddressTag = (at: AddressTagDto) => {
    setEditingAddressTag(at);
    setAddressTagDialogOpen(true);
  };

  const handleDeleteAddressTag = (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove address tag "${name}"?`)) return;
    void (async () => {
      try {
        const res = await deleteAddressTagAction(id);
        if (res.deactivatedInstead) {
          toast.info(`"${name}" is referenced by existing orders or accounts and has been deactivated instead.`);
          setAddressTags((prev) => prev.map((t) => (t.id === id ? { ...t, active: false } : t)));
        } else {
          toast.success(`"${name}" removed successfully.`);
          setAddressTags((prev) => prev.filter((t) => t.id !== id));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete address tag.");
      }
    })();
  };

  const formatChargeDisplay = (chargeType: DeliveryChargeType, chargeValue: number) => {
    if (chargeType === "none" || chargeValue === 0) return "Free ($0.00)";
    if (chargeType === "fixed") return `$${chargeValue.toFixed(2)}`;
    if (chargeType === "percent") return `${chargeValue}% of plan`;
    return "-";
  };

  return (
    <div className="space-y-6">
      {/* 1. Base Delivery Charge Card */}
      <SectionCard
        title="Base Delivery Charge"
        subtitle="Standard baseline charge added to every order before specific delivery location or address tag rules are applied."
        action={
          <Button variant="outline" size="sm" onClick={handleOpenBaseDialog}>
            <PencilIcon className="mr-1.5 size-3.5" />
            Edit base charge
          </Button>
        }
      >
        <div className="flex items-center gap-4 py-2">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <DollarSignIcon className="size-6" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">
              ${baseCharge.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Applied automatically to all orders during checkout calculation.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* 2. Delivery Types Table */}
      <SectionCard
        title="Delivery Types"
        subtitle="Configurable options for how or where the order is dropped off (e.g. Front Door, Lobby, Rear Door)."
        action={
          <Button size="sm" onClick={handleOpenAddDeliveryType}>
            <PlusIcon className="mr-1.5 size-3.5" />
            Add delivery type
          </Button>
        }
      >
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Name</TableHead>
                <TableHead className="w-[30%]">Description</TableHead>
                <TableHead className="w-[15%]">Charge Type</TableHead>
                <TableHead className="w-[15%]">Amount / Rate</TableHead>
                <TableHead className="w-[10%]">Status</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveryTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No delivery types configured yet. Click &quot;Add delivery type&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                deliveryTypes.map((dt) => (
                  <TableRow key={dt.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <TruckIcon className="size-4 text-muted-foreground" />
                        <span>{dt.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dt.description || "—"}
                    </TableCell>
                    <TableCell className="capitalize">
                      {dt.chargeType}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatChargeDisplay(dt.chargeType, dt.chargeValue)}
                    </TableCell>
                    <TableCell>
                      {dt.active ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => handleOpenEditDeliveryType(dt)}
                          title="Edit"
                        >
                          <PencilIcon className="size-3.5" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteDeliveryType(dt.id, dt.name)}
                          title="Delete"
                        >
                          <Trash2Icon className="size-3.5" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* 3. Address Tags Table */}
      <SectionCard
        title="Address Tags"
        subtitle="Pricing rules linked to the customer's dwelling or address tag (e.g. House, Apartment, Commercial Building)."
        action={
          <Button size="sm" onClick={handleOpenAddAddressTag}>
            <PlusIcon className="mr-1.5 size-3.5" />
            Add address tag
          </Button>
        }
      >
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Tag Name</TableHead>
                <TableHead className="w-[30%]">Description</TableHead>
                <TableHead className="w-[15%]">Charge Type</TableHead>
                <TableHead className="w-[15%]">Amount / Rate</TableHead>
                <TableHead className="w-[10%]">Status</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addressTags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No address tags configured yet. Click &quot;Add address tag&quot; to create one.
                  </TableCell>
                </TableRow>
              ) : (
                addressTags.map((at) => (
                  <TableRow key={at.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <HomeIcon className="size-4 text-muted-foreground" />
                        <span>{at.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {at.description || "—"}
                    </TableCell>
                    <TableCell className="capitalize">
                      {at.chargeType}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatChargeDisplay(at.chargeType, at.chargeValue)}
                    </TableCell>
                    <TableCell>
                      {at.active ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-muted text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => handleOpenEditAddressTag(at)}
                          title="Edit"
                        >
                          <PencilIcon className="size-3.5" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteAddressTag(at.id, at.name)}
                          title="Delete"
                        >
                          <Trash2Icon className="size-3.5" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Edit Base Charge Dialog */}
      <ResponsiveDialog
        open={baseChargeOpen}
        onOpenChange={setBaseChargeOpen}
        title="Edit Base Delivery Charge"
      >
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="base-charge-val">Base Charge ($)</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
              <Input
                id="base-charge-val"
                type="number"
                step="0.01"
                min="0"
                className="pl-7"
                value={baseChargeInput}
                onChange={(e) => setBaseChargeInput(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Applied automatically to all orders as the base delivery fee.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBaseChargeOpen(false)}
              disabled={isSavingBase}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveBaseCharge}
              disabled={isSavingBase}
            >
              {isSavingBase && <Loader2Icon className="mr-1.5 size-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      {/* Delivery Type Add/Edit Dialog */}
      <ItemChargeDialog
        open={deliveryTypeDialogOpen}
        onOpenChange={setDeliveryTypeDialogOpen}
        item={editingDeliveryType}
        title={editingDeliveryType ? "Edit Delivery Type" : "Add Delivery Type"}
        namePlaceholder="e.g. Front Door, Lobby, Garage"
        onSave={async (values) => {
          const saved = await saveDeliveryTypeAction(values);
          setDeliveryTypes((prev) => {
            const idx = prev.findIndex((p) => p.id === saved.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = saved;
              return next;
            }
            return [...prev, saved];
          });
        }}
      />

      {/* Address Tag Add/Edit Dialog */}
      <ItemChargeDialog
        open={addressTagDialogOpen}
        onOpenChange={setAddressTagDialogOpen}
        item={editingAddressTag}
        title={editingAddressTag ? "Edit Address Tag" : "Add Address Tag"}
        namePlaceholder="e.g. House, Apartment, Commercial Building"
        onSave={async (values) => {
          const saved = await saveAddressTagAction(values);
          setAddressTags((prev) => {
            const idx = prev.findIndex((p) => p.id === saved.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = saved;
              return next;
            }
            return [...prev, saved];
          });
        }}
      />
    </div>
  );
}

interface ItemChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id?: string;
    name: string;
    description: string | null;
    chargeType: DeliveryChargeType;
    chargeValue: number;
    active: boolean;
  } | null;
  title: string;
  namePlaceholder: string;
  onSave: (values: {
    id?: string;
    name: string;
    description?: string | null;
    chargeType: DeliveryChargeType;
    chargeValue: number;
    active?: boolean;
  }) => Promise<void>;
}

function ItemChargeDialog({
  open,
  onOpenChange,
  item,
  title,
  namePlaceholder,
  onSave,
}: ItemChargeDialogProps) {
  return open ? (
    <ItemChargeDialogBody
      key={item?.id ?? "__new__"}
      open={open}
      onOpenChange={onOpenChange}
      item={item}
      title={title}
      namePlaceholder={namePlaceholder}
      onSave={onSave}
    />
  ) : null;
}

function ItemChargeDialogBody({
  onOpenChange,
  item,
  title,
  namePlaceholder,
  onSave,
}: ItemChargeDialogProps) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [chargeType, setChargeType] = useState<DeliveryChargeType>(item?.chargeType ?? "none");
  const [chargeValue, setChargeValue] = useState(
    item?.chargeValue != null ? String(item.chargeValue) : "0.00",
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [saving, startSaving] = useTransition();

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Please enter a name.");
      return;
    }

    const val = chargeType === "none" ? 0 : Number(chargeValue);
    if (!Number.isFinite(val) || val < 0) {
      toast.error("Please enter a valid charge value (0 or greater).");
      return;
    }
    if (chargeType === "percent" && val > 100) {
      toast.error("Percentage charge cannot exceed 100%.");
      return;
    }

    startSaving(async () => {
      try {
        await onSave({
          id: item?.id,
          name: trimmedName,
          description: description.trim() || null,
          chargeType,
          chargeValue: val,
          active,
        });
        toast.success(`${title} saved successfully.`);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  };

  return (
    <ResponsiveDialog open onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="charge-item-name">Name *</Label>
          <Input
            id="charge-item-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="charge-item-desc">Description (optional)</Label>
          <Input
            id="charge-item-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Helpful note for staff or customers"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="charge-item-type">Charge Type</Label>
          <Select
            value={chargeType}
            onValueChange={(val) => setChargeType(val as DeliveryChargeType)}
          >
            <SelectTrigger id="charge-item-type">
              <SelectValue placeholder="Select charge type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Zero charge (Free)</SelectItem>
              <SelectItem value="fixed">Fixed amount ($)</SelectItem>
              <SelectItem value="percent">Percentage of plan price (%)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {chargeType !== "none" && (
          <div className="space-y-2">
            <Label htmlFor="charge-item-val">
              {chargeType === "fixed" ? "Charge Amount ($)" : "Percentage (%)"}
            </Label>
            <div className="relative">
              {chargeType === "fixed" && (
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">$</span>
              )}
              <Input
                id="charge-item-val"
                type="number"
                step={chargeType === "fixed" ? "0.01" : "0.5"}
                min="0"
                max={chargeType === "percent" ? "100" : undefined}
                className={chargeType === "fixed" ? "pl-7" : "pr-7"}
                value={chargeValue}
                onChange={(e) => setChargeValue(e.target.value)}
                placeholder="0.00"
              />
              {chargeType === "percent" && (
                <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">%</span>
              )}
            </div>
            {chargeType === "percent" && (
              <p className="text-xs text-muted-foreground">
                Calculated against the customer&apos;s selected plan price (e.g. 5% on a $100 plan = $5.00).
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="charge-item-active" className="text-sm font-medium">
              Active status
            </Label>
            <p className="text-xs text-muted-foreground">
              Inactive rules cannot be selected on new orders.
            </p>
          </div>
          <Switch
            id="charge-item-active"
            checked={active}
            onCheckedChange={setActive}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2Icon className="mr-1.5 size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
