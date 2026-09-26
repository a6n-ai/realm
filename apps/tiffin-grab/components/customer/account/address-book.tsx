"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import type { AddressValues } from "@foundry/commons";
import type { AddressInput, SavedAddress } from "@foundry/address";
import { useAddressBook } from "@foundry/address/hooks";
import { formatAddress } from "@foundry/address/ui";
import { Button, Card, Field, IconButton, Notice, Pill, Sheet } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import {
  archiveMyAddress,
  createMyAddress,
  setMyDefaultAddress,
  updateSavedAddress,
} from "@/app/(customer)/me/account/address-actions";
import { unwrapAction } from "@/lib/actions/unwrap";

type Editing = { publicId: string | null; label: string; values: AddressValues };

const toValues = (a: SavedAddress): AddressValues => ({
  addressLine: a.addressLine,
  addressUnit: a.addressUnit ?? "",
  city: a.city,
  postalCode: a.postalCode,
  deliveryInstructions: a.deliveryInstructions ?? "",
});

const toInput = (e: Editing): AddressInput => ({
  label: e.label || null,
  addressLine: e.values.addressLine ?? "",
  addressUnit: e.values.addressUnit,
  city: e.values.city ?? "",
  postalCode: e.values.postalCode ?? "",
  deliveryInstructions: e.values.deliveryInstructions,
});

/** Saved delivery addresses. The default is what checkout preselects and can't be deleted. */
export function AddressBook({ initial }: { initial: SavedAddress[] }) {
  const book = useAddressBook({
    initial,
    actions: {
      create: (input) => unwrapAction(createMyAddress(input)),
      update: (publicId, input) => unwrapAction(updateSavedAddress(publicId, input)),
      setDefault: async (publicId) => {
        await unwrapAction(setMyDefaultAddress(publicId));
      },
      archive: (publicId) => unwrapAction(archiveMyAddress(publicId)),
    },
  });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<SavedAddress | null>(null);
  const defaultLabel = book.addresses.find((a) => a.isDefault)?.label ?? "your default address";

  async function save() {
    if (!editing) return;
    const ok = editing.publicId ? await book.update(editing.publicId, toInput(editing)) : await book.create(toInput(editing));
    if (ok) setEditing(null);
  }

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await book.archive(deleting.publicId);
    if (ok) setDeleting(null);
  }

  return (
    <Card className="space-y-5 p-5 md:p-6">
      <header className="space-y-1">
        <h2 className="c-h2">Delivery addresses</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Checkout uses your default. You can pick another for any delivery.</p>
      </header>

      <ul className="space-y-3">
        {book.addresses.map((a) => (
          <li key={a.publicId} data-address={a.publicId} className="flex items-start justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 font-semibold">
                <span>{a.label}</span>
                {a.isDefault && <Pill tone="ok" size="sm">Default</Pill>}
              </p>
              <p className="truncate text-sm text-[var(--muted-foreground)]">{formatAddress(a)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              {!a.isDefault && (
                <IconButton aria-label={`Make ${a.label} the default`} onClick={() => book.setDefault(a.publicId)}>
                  <StarIcon className="size-4" />
                </IconButton>
              )}
              <IconButton aria-label={`Edit ${a.label}`} onClick={() => setEditing({ publicId: a.publicId, label: a.label, values: toValues(a) })}>
                <PencilIcon className="size-4" />
              </IconButton>
              {!a.isDefault && (
                <IconButton aria-label={`Delete ${a.label}`} onClick={() => setDeleting(a)}>
                  <Trash2Icon className="size-4" />
                </IconButton>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Sheet actions show their error inside the sheet; this covers make-default. */}
      {book.error && !editing && !deleting && <Notice tone="error">{book.error}</Notice>}

      <Button pill onClick={() => setEditing({ publicId: null, label: "", values: {} })}>
        <PlusIcon className="size-4" /> Add address
      </Button>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.publicId ? "Edit address" : "Add address"}
        footer={
          <Button pill variant="primary" pending={book.pending} onClick={save}>
            Save address
          </Button>
        }
      >
        {editing && (
          <div className="space-y-4">
            <Field label="Label" placeholder="Home, Work…" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            <AddressFields
              preset="delivery"
              idPrefix="address-book"
              fields={["addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions"]}
              values={editing.values}
              resolveUrl="/api/address/resolve"
              onChange={(patch) => setEditing({ ...editing, values: { ...editing.values, ...patch } })}
            />
            {book.error && <Notice tone="error">{book.error}</Notice>}
          </div>
        )}
      </Sheet>

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.label ?? "address"}?`}
        footer={
          <Button pill variant="danger" pending={book.pending} onClick={confirmDelete}>
            Delete address
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">Upcoming deliveries here will move to {defaultLabel}.</p>
          {book.error && <Notice tone="error">{book.error}</Notice>}
        </div>
      </Sheet>
    </Card>
  );
}
