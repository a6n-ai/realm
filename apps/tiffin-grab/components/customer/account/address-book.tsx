"use client";

import { useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import type { AddressValues } from "@foundry/commons";
import type { AddressInput, SavedAddress } from "@foundry/address";
import { useAddressBook } from "@foundry/address/hooks";
import { formatAddress } from "@foundry/address/ui";
import { Button, Card, Field, IconButton, Notice, Pill, Sheet } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import { nameTaken } from "@/components/customer/address/address-name";
import { AddressDropOffLines, DropOffPicker } from "@/components/customer/address/drop-off";
import { EMPTY_DROP_OFF, NO_DROP_OFF, type DropOffCatalog, type DropOffValue } from "@/lib/catalog/drop-off";

const withDropOff = (d: Record<string, DropOffValue>, publicId: string, dropOff: DropOffValue) => {
  const next = { ...d };
  if (dropOff.tagId) next[publicId] = dropOff;
  else delete next[publicId];
  return next;
};
const GOLD = "#F5B301";

/**
 * The default toggle: an outline star that fills gold with a pop and a ring burst when
 * tapped (the address then slides to the top); the default's star stays filled.
 */
function DefaultStar({ on, label, onSelect }: { on: boolean; label: string; onSelect: () => void }) {
  const [taps, setTaps] = useState(0);
  return (
    <IconButton
      aria-label={on ? `${label} is the default` : `Make ${label} the default`}
      aria-pressed={on}
      // aria-disabled, not disabled: a disabled button gets no hover, and the tip should still show.
      aria-disabled={on}
      tip={on ? "Default address" : "Make default — checkout uses it"}
      className={on ? "cursor-default" : "transition-transform active:scale-90 motion-reduce:transition-none"}
      onClick={() => {
        if (on) return;
        setTaps((n) => n + 1);
        onSelect();
      }}
    >
      <motion.span
        key={taps}
        className="grid place-items-center"
        animate={taps ? { scale: [1, 1.5, 0.88, 1], rotate: [0, -20, 10, 0] } : undefined}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <StarIcon
          className="size-4 transition-[fill,color] duration-300 motion-reduce:transition-none"
          style={on ? { color: GOLD, fill: GOLD } : { fill: "transparent" }}
        />
      </motion.span>
      {taps > 0 && (
        <motion.span
          key={`ring-${taps}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{ borderColor: GOLD }}
          initial={{ scale: 0.5, opacity: 0.8 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        />
      )}
    </IconButton>
  );
}

import {
  archiveMyAddress,
  createMyAddress,
  setMyDefaultAddress,
  updateSavedAddress,
} from "@/app/(customer)/me/account/address-actions";
import { unwrapAction } from "@/lib/actions/unwrap";

type Editing = { publicId: string | null; label: string; values: AddressValues; dropOff: DropOffValue };

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
export function AddressBook({
  initial,
  dropOff = EMPTY_DROP_OFF,
  initialDropOffs = {},
}: {
  initial: SavedAddress[];
  /** Drop-off questions a customer answers per address. */
  dropOff?: DropOffCatalog;
  /** Address public id → its drop-off. */
  initialDropOffs?: Record<string, DropOffValue>;
}) {
  const [dropOffs, setDropOffs] = useState(initialDropOffs);
  const [editing, setEditing] = useState<Editing | null>(null);
  const book = useAddressBook({
    initial,
    actions: {
      create: async (input) => {
        const saved = await unwrapAction(createMyAddress(input, editing?.dropOff ?? NO_DROP_OFF));
        setDropOffs((d) => withDropOff(d, saved.publicId, editing?.dropOff ?? NO_DROP_OFF));
        return saved;
      },
      update: async (publicId, input) => {
        const saved = await unwrapAction(updateSavedAddress(publicId, input, editing?.dropOff ?? NO_DROP_OFF));
        setDropOffs((d) => withDropOff(d, publicId, editing?.dropOff ?? NO_DROP_OFF));
        return saved;
      },
      setDefault: async (publicId) => {
        await unwrapAction(setMyDefaultAddress(publicId));
      },
      archive: (publicId) => unwrapAction(archiveMyAddress(publicId)),
    },
  });
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

      <MotionConfig reducedMotion="user">
      <ul className="space-y-3">
        {book.addresses.map((a) => (
          <motion.li
            key={a.publicId}
            // Slides to its new place when it becomes (or stops being) the default.
            layout
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            data-address={a.publicId}
            className="flex items-start justify-between gap-3 rounded-2xl border bg-[var(--card)] p-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 font-semibold">
                <span>{a.label}</span>
                <AnimatePresence initial={false}>
                  {a.isDefault && (
                    <motion.span
                      key="default"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ type: "spring", stiffness: 520, damping: 22 }}
                    >
                      <Pill tone="ok" size="sm">Default</Pill>
                    </motion.span>
                  )}
                </AnimatePresence>
              </p>
              <p className="truncate text-sm text-[var(--muted-foreground)]">{formatAddress(a)}</p>
              <AddressDropOffLines catalog={dropOff} value={dropOffs[a.publicId]} note={a.deliveryInstructions} />
            </div>
            <div className="flex shrink-0 gap-1">
              <DefaultStar on={a.isDefault} label={a.label} onSelect={() => book.setDefault(a.publicId)} />
              <IconButton aria-label={`Edit ${a.label}`} onClick={() => setEditing({ publicId: a.publicId, label: a.label, values: toValues(a), dropOff: dropOffs[a.publicId] ?? NO_DROP_OFF })}>
                <PencilIcon className="size-4" />
              </IconButton>
              {!a.isDefault && (
                <IconButton aria-label={`Delete ${a.label}`} onClick={() => setDeleting(a)}>
                  <Trash2Icon className="size-4" />
                </IconButton>
              )}
            </div>
          </motion.li>
        ))}
      </ul>
      </MotionConfig>

      {/* Sheet actions show their error inside the sheet; this covers make-default. */}
      {book.error && !editing && !deleting && <Notice tone="error">{book.error}</Notice>}

      <Button pill onClick={() => setEditing({ publicId: null, label: "", values: {}, dropOff: NO_DROP_OFF })}>
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
            <Field
              label="Name"
              placeholder="Home, Office, Mom's place…"
              maxLength={40}
              value={editing.label}
              error={nameTaken(editing.label, book.addresses.filter((a) => a.publicId !== editing.publicId))}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            />
            <AddressFields
              preset="delivery"
              idPrefix="address-book"
              fields={["addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions"]}
              values={editing.values}
              resolveUrl="/api/address/resolve"
              onChange={(patch) => setEditing({ ...editing, values: { ...editing.values, ...patch } })}
            />
            <DropOffPicker catalog={dropOff} value={editing.dropOff} onChange={(picks) => setEditing({ ...editing, dropOff: picks })} />
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
