"use client";

import { useState } from "react";
import { Pill } from "@/components/brutal/shared";

/** The four beats every fusion puchka follows, whatever the filling. */
const STEP_TITLES = ["Start With The Base", "Add The Sauce", "Garnish", "Eat Immediately"];

type Step = { text: string; tip?: string };
type Assembly = { emoji: string; name: string; steps: Step[] };

/**
 * Per-puchka build instructions. Only puchkas the kitchen actually sells appear
 * here — Clover is the catalogue authority, so a card for something nobody can
 * order would be a menu claim we can't honour.
 */
const ASSEMBLY: Assembly[] = [
  {
    emoji: "🌶️",
    name: "Spicy Chicken Blast Puchka",
    steps: [
      { text: "Place the spicy chicken stuffing inside the puchka shell.", tip: "Don't overfill — this keeps it crunchy." },
      { text: "Drizzle tandoori mayo evenly over the filling.", tip: "Use half first, add more if needed." },
      { text: "Top with red & yellow peppers." },
      { text: "Eat fresh for the best experience." },
    ],
  },
  {
    emoji: "🥪",
    name: "Firangi Chicken Puchka",
    steps: [
      { text: "Place one piece of firangi chicken inside the puchka shell.", tip: "Add the second piece after sauce for better balance." },
      { text: "Add a little white sauce, then drizzle white mayo evenly.", tip: "Don't drown the filling." },
      { text: "Top with pepper, chilli flakes & oregano." },
      { text: "Best enjoyed fresh." },
    ],
  },
  {
    emoji: "🍤",
    name: "Korean Prawn Puchka",
    steps: [
      { text: "Fill the puchka with the spiced prawn stuffing.", tip: "Keep it light to avoid breakage." },
      { text: "Drizzle white mayo evenly over the prawns." },
      { text: "Top with peppers." },
      { text: "Fresh is key for maximum crunch." },
    ],
  },
  {
    emoji: "🌽",
    name: "Corn Cheese Puchka",
    steps: [
      { text: "Fill the puchka with corn cheese stuffing.", tip: "Do not pack it tightly." },
      { text: "Drizzle Thousand Island sauce evenly." },
      { text: "Top with grated cheese, oregano & chilli flakes." },
      { text: "Best enjoyed fresh." },
    ],
  },
  {
    emoji: "🍄",
    name: "Mushroom Blast Puchka",
    steps: [
      { text: "Fill the puchka with mushroom stuffing." },
      { text: "Drizzle tandoori mayo evenly." },
      { text: "Top with red & yellow peppers." },
      { text: "Enjoy right away." },
    ],
  },
  {
    emoji: "🧀",
    name: "Paneer Schezwan Puchka",
    steps: [
      { text: "Fill the puchka with paneer schezwan stuffing.", tip: "Spread it evenly inside the shell." },
      { text: "No extra sauce needed — the stuffing is already doing the work." },
      { text: "Top with peppers." },
      { text: "Fresh is best." },
    ],
  },
  {
    emoji: "🍜",
    name: "Pan Fried Noodle Puchka",
    steps: [
      { text: "Fill the puchka with the pan-fried noodles.", tip: "Do not overfill." },
      { text: "No extra sauce required." },
      { text: "Top with red & yellow peppers." },
      { text: "Enjoy immediately for the best crunch." },
    ],
  },
];

/** Short chip label — the shared "Puchka" suffix is noise in a row of chips. */
const chipLabel = (name: string) => name.replace(/ Puchka$/, "");

export function AssemblyGuide() {
  const [selected, setSelected] = useState(0);
  const active = ASSEMBLY[selected]!;

  return (
    <div>
      <div className="assembly__picker" role="tablist" aria-label="Pick a fusion puchka">
        {ASSEMBLY.map((a, i) => (
          <button
            key={a.name}
            type="button"
            role="tab"
            aria-selected={i === selected}
            className={`assembly__chip ${i === selected ? "is-on" : ""}`}
            onClick={() => setSelected(i)}
          >
            <span aria-hidden="true">{a.emoji}</span> {chipLabel(a.name)}
          </button>
        ))}
      </div>

      <div className="card assembly__panel">
        <div className="flex center between wrap-gap assembly__head">
          <h3 className="display assembly__title">
            <span aria-hidden="true">{active.emoji}</span> {active.name}
          </h3>
          <Pill variant="green">{active.steps.length} steps</Pill>
        </div>
        <ol className="grid assembly__steps">
          {active.steps.map((step, i) => (
            <li
              key={`${active.name}-${i}`}
              className="card assembly__step"
              style={{ background: i % 2 ? "var(--cream)" : "var(--paper)" }}
            >
              <div className="flex center assembly__step-head">
                <span className="assembly__num" aria-hidden="true">
                  {i + 1}
                </span>
                <h4 className="assembly__step-title">{STEP_TITLES[i]}</h4>
              </div>
              <p className="assembly__step-text">{step.text}</p>
              {step.tip ? <p className="assembly__tip">Tip: {step.tip}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
