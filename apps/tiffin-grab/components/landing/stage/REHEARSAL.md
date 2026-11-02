# Rehearsal: PauseDemo
Gold: examples/phone-touch (Phone + touch cursor + script shape). Kit trimmed to stage, act, cursor, keys, looks, measure, phone (+css) in `kit/`; kit CSS is `.ss-` prefixed in `@layer stageshow`, demo CSS is `.pd` / `pd-` scoped.
Screen rebuilt from the real /me Deliveries screen (components/customer/deliveries/{plan-header,week-strip,trip-parts,action-panel}.tsx, globals.css tokens): header pills, "Hi, Priya.", plan card with tag-colour edge, week card, Delivery block, Journey tracker, floating Edit meal / Move / Pause bar + menu FAB, floating tab bar. Invented chips/dishes/Plan-ends removed.
Beats: 1 Tue selected (1.4s) 2 tap Wed, title and cutoff line roll to "Wed, Nov 4" / "Changes until Tue 6:00 PM" 3 tap Pause (one tap): Wed dot turns orange, Pause rolls to Resume, toast "Paused Wed." 4 hold 3.6s (poster) 5 toast leaves, tap Resume, toast "Resumed Wed.", tap Tue: back to start. Loop about 13s.
Captured: wide 340 and compact 300 on cream at localhost:3000, start and poster beats by screenshot.
Film: film.mjs / --gate not run.
Assumptions: Nov 2026 dates and generic name (Priya, PK) as in the reference screenshots; meal peek tiles are label-only.
Unresolved: toast covers the tracker's middle stop while visible (as in the real app).
Not checked: reduced-motion poster, offscreen pause, loop seam frames, over a real photo, Resume/Tue-tap frames.

# Rehearsal: MenuPickDemo
Kit and scoping as PauseDemo (`.mp` / `mp-`, same Stage/Phone, wide 340 / compact 300; `compact` prop forces the compact design). Screen from components/customer/deliveries (EatingCard Delivery + "Your meal" MealTiles, floating bar/tabs) and the Edit meal Sheet (kit/sheet.tsx, accordion CategorySection, Choice radios, Done/Save footer).
Beats: 1 hold (1.5s) 2 tap Edit meal, sheet rises 3 tap the changed category's row, it opens 4 tap dish 2, radio moves, row says Changed, Done becomes Save 5 tap Save, sheet closes, tile shows the new dish (saffron outline) + toast "Meals saved", hold 3.8s (poster) 6 reset: toast leaves, tap neighbouring day (neutral filler card), pick snaps back unseen, tap the day again. Loop about 14s.
Data: props only; first category with 2+ dishes changes dishes[0] to dishes[1]; max 3 categories, filler bars for the rest; none with 2+ dishes renders a still poster.
Assumptions: no dates shown (weekday names only); the neighbouring day's card is filler, not real data.
Not checked: visually at 340/300, reduced-motion poster, loop seam frames.
