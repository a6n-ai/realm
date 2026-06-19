"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reactivateDish, retireDish, saveDish } from "./actions";

type Dish = {
  id: string;
  name: string;
  description: string | null;
  diet: "veg" | "nonveg";
  slots: string[];
  imageUrl: string | null;
  active: boolean;
};

const SLOT_OPTIONS = ["breakfast", "lunch", "dinner"] as const;

type FormValues = {
  name: string;
  description: string;
  diet: "veg" | "nonveg";
  slots: string[];
  imageUrl: string;
};

const emptyForm = (): FormValues => ({ name: "", description: "", diet: "veg", slots: [], imageUrl: "" });

function DishForm({
  values,
  setValues,
}: {
  values: FormValues;
  setValues: (v: FormValues) => void;
}) {
  const toggle = (slot: string) =>
    setValues({
      ...values,
      slots: values.slots.includes(slot)
        ? values.slots.filter((s) => s !== slot)
        : [...values.slots, slot],
    });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>Name</Label>
        <Input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      </div>
      <div>
        <Label>Diet</Label>
        <Select value={values.diet} onValueChange={(v) => setValues({ ...values, diet: v as "veg" | "nonveg" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="veg">veg</SelectItem>
            <SelectItem value="nonveg">nonveg</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
        <Input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
      </div>
      <div>
        <Label>Image URL <span className="text-muted-foreground">(optional)</span></Label>
        <Input value={values.imageUrl} onChange={(e) => setValues({ ...values, imageUrl: e.target.value })} />
      </div>
      <div>
        <Label>Slots</Label>
        <div className="flex gap-3 pt-1">
          {SLOT_OPTIONS.map((slot) => (
            <label key={slot} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={values.slots.includes(slot)}
                onChange={() => toggle(slot)}
              />
              {slot}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DishesEditor({ dishes }: { dishes: Dish[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>(emptyForm());

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });

  const startNew = () => {
    setEditingId("__new__");
    setValues(emptyForm());
  };

  const startEdit = (dish: Dish) => {
    setEditingId(dish.id);
    setValues({
      name: dish.name,
      description: dish.description ?? "",
      diet: dish.diet,
      slots: dish.slots,
      imageUrl: dish.imageUrl ?? "",
    });
  };

  const save = () =>
    run(async () => {
      await saveDish(editingId === "__new__" ? null : editingId, {
        name: values.name,
        diet: values.diet,
        slots: values.slots,
        description: values.description || null,
        imageUrl: values.imageUrl || null,
      });
      setEditingId(null);
    });

  return (
    <div className="space-y-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {editingId ? (
        <div className="grid gap-3 rounded-lg border p-4">
          <h2 className="font-medium">{editingId === "__new__" ? "New dish" : "Edit dish"}</h2>
          <DishForm values={values} setValues={setValues} />
          <div className="flex gap-2">
            <Button onClick={save} disabled={pending}>Save</Button>
            <Button variant="outline" onClick={() => setEditingId(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={startNew}>Add dish</Button>
      )}

      <div className="space-y-2">
        {dishes.map((dish) => (
          <div key={dish.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{dish.name}</span>
              <Badge variant="outline">{dish.diet}</Badge>
              {dish.slots.length > 0 ? (
                <span className="text-muted-foreground">{dish.slots.join(", ")}</span>
              ) : null}
              {!dish.active ? <Badge variant="outline">retired</Badge> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => startEdit(dish)} disabled={pending}>Edit</Button>
              {!dish.active ? (
                <Button size="sm" variant="outline" onClick={() => run(() => reactivateDish(dish.id))} disabled={pending}>Reactivate</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => run(() => retireDish(dish.id))} disabled={pending}>Retire</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
