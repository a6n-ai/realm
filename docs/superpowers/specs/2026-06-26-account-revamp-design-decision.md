# Account Revamp — Design Decision (WF2)

Winner: **single-scroll (Proposal A as base) — a hybrid that grafts B's config-as-single-source-of-truth structural role gating and B/C's hash deep-linking + C's scroll-mt anchor ids, while deferring B's tabs and C's sticky sub-nav rail.**

## Rationale
For a role-aware, two-audience surface where the SAME shell must render cleanly from staff's 4 cards to the customer's 7, single-scroll wins because it has no mode switch: one ordered list of SectionCards driven by a Record<Role, GroupSpec[]> map, and every card is an independent per-card save unit (form.formState.isDirty -> footer button -> optimistic sonner toast -> reset). Tabs (B) and a sub-nav (C) both imply "navigate between modes," which fights per-card saves and — critically for the customer — hides sections behind a click. A tab a new customer never opens is a delivery address they never set; single-scroll makes every section unmissable and reads as a guided profile-completion checklist. From B I graft the structural-safety property: gating lives in one config map (sections.config.ts keyed on Role), so PIN simply is not in the user branch and customer fields are not in the staff branch — no conditional-render-inside-a-shared-card leak path, which is exactly what the design's Role-Gating Review dimension checks. From B and C I graft cheap hash deep-linking (#address, #notifications) so transactional emails ("update your delivery address") land on the right card, plus C's scroll-mt-24 anchor offset — but WITHOUT building C's IntersectionObserver rail (double-chrome risk beside the existing app Sidebar) or B's tab/Select client island. The result keeps account-settings.tsx a server component (the hard constraint), with client confined to the leaf form bodies. C's sticky jump rail is explicitly deferred to when the customer field set grows (multiple addresses, payment, subscription) — that is the documented trigger to revisit.

## Sections by role
Three stable semantic groups, always Profile -> Delivery -> Security top-to-bottom; a role omits groups/sections it lacks, never reorders.

admin (2 groups, 4 cards): [Profile group] 1. Profile (avatar + name)  2. Contact (phone, email + verify badge + resend-if-unverified). [Security group] 3. PIN (staff idle-lock)  4. Password & sign-out.

member (2 groups, 4 cards): IDENTICAL to admin (matrix rows are the same; both resolve to the staff branch). 1. Profile  2. Contact  3. PIN  4. Password & sign-out.

user / customer (3 groups, 7 cards): [Profile group] 1. Profile (avatar + name)  2. Contact (phone, email + verify). [Delivery group] 3. Delivery address  4. Dietary & allergens  5. Delivery notes  6. Notifications (Email/SMS switches). [Security group] 7. Password & sign-out (NO PIN). The Delivery group heading chunks the four customer-only cards into one "stuff that affects what shows up at your door" narrative so 7 cards read as 1 region, not 4 loose extras. Security stays last (conventional, least-touched). Order is a direct transcription of the design doc's matrix rows.

## Component tree (build spec)
apps/web/components/account/
  account-settings.tsx        // SHARED shell, SERVER component. Props: { role: Role, user: SerializableUser, defaultCountry: CountryCode }. Reads SECTION_GROUPS[role], renders SectionGroup per group, each SectionCard-wrapped leaf. Never imports authClient; passes plain serializable props down. Constrains forms column to max-w-2xl inside PageShell.
  sections.config.ts          // SINGLE SOURCE OF TRUTH. export const SECTION_GROUPS: Record<Role,{ heading?: string; sections: SectionKey[] }[]>. SectionKey union: 'profile'|'contact'|'address'|'dietary'|'deliveryNotes'|'notifications'|'pin'|'password'. Plus SECTION_META: Record<SectionKey,{ id: string; title: string; subtitle?: string }> (id powers #hash anchors + scroll-mt).
  section-group.tsx           // SERVER. Renders optional plain text-muted-foreground heading + the group's cards with space-y-5; groups separated by space-y-10 (2:1 rhythm). Omits heading entirely when group has no heading (staff stays un-ceremonial). Aligns heading to card OUTER edge.
  sections/
    profile-section.tsx       // 'use client'. SectionCard("Profile") wrapping AvatarField + ProfileForm. Avatar centered <sm, left-aligned >=sm.
    contact-section.tsx       // 'use client'. SectionCard("Contact") wrapping AccountForm + solid verify Badge (verified/unverified token) + ResendVerification shown ONLY when unverified.
    address-section.tsx       // 'use client', NEW. SectionCard("Delivery address"). grid sm:grid-cols-2 gap-3; address_line + col-span-2; unit+city row; postal+province row; province = Select (typed control). Wires updateMyAddress action. Empty-state subtitle when null.
    dietary-section.tsx       // 'use client', NEW. SectionCard("Dietary & allergens"). Hand-built allergens multiselect (Command+Popover+removable Badge) + dietary_notes Textarea. Wires updateMyPreferences.
    delivery-notes-section.tsx// 'use client', NEW. SectionCard("Delivery notes"). Textarea (gate code / drop-off / landmark). Wires updateMyPreferences.
    notifications-section.tsx // 'use client', NEW. SectionCard("Notifications"). Two Switch rows (Email / SMS) label-left toggle-right. Wires updateMyPreferences.
    pin-section.tsx           // 'use client'. SectionCard("PIN") wrapping existing PinSection (hasPin prop).
    password-section.tsx      // 'use client'. SectionCard("Password") wrapping ChangePasswordForm (authClient direct, keep) + SignOutButton.
  leaves/                     // MOVE existing presentational leaves here (AvatarField, ProfileForm, AccountForm, ResendVerification, ChangePasswordForm, SignOutButton, PinSection) so a shared component does not import from a route folder. Internals UNCHANGED. Server actions stay in the staff route's actions.ts and are imported by the leaves as today; add updateMyAddress + updateMyPreferences there.

Staff route consumption — apps/web/app/(dashboard)/dashboard/account/page.tsx:
  - Replace <AccountTabs .../> with <AccountSettings role={session.user.role as Role} user={user} defaultCountry={defaultCountry} />.
  - Thread session.user.role (currently fetched-but-dropped). Keep getSession + usersService.read + getAppSettings + PageShell/PageHeader unchanged. Delete account-tabs.tsx after cutover.

Customer landing consumption — apps/web/app/(dashboard)/dashboard/page.tsx:
  - Remove the role 'user' -> /dashboard/account redirect. Render a bare welcome block (full-width PageHeader) + embed <AccountSettings role={Role.USER} user={user} defaultCountry={defaultCountry} /> (or link to /dashboard/account which the sidebar already exposes to user). Same shared component, role drives the 7-card set.

New service methods (per services-extend-commons): usersService.updateAddress(userId,input) + updatePreferences(userId,input), each validate(zod)->typed patch->return super.update(...). New nullable columns via db:generate.

## Polish & a11y checklist
- Per-card save state, never a global save bar: footer button disabled until form.formState.isDirty; disabled->enabled IS the unsaved-changes signal.
- On submit: button -> pending (spinner + 'Save'->'Saving...'); reserve min-w sized to the wider label so no reflow.
- On success: toast.success (sonner), form.reset(new values) so isDirty clears and button returns to disabled; optimistic local update, rollback + toast.error on action rejection.
- Each action keeps revalidatePath('/dashboard/account') as existing actions do; optimistic reset gives instant feedback before the round-trip.
- tabular-nums on every numeric/coded field that can change width: postal code, phone input, PIN attempts counter, any 'last updated' timestamp.
- Optical alignment: group heading left edge aligns to card OUTER edge (account for Card p-5); reserve button width for label swaps.
- Flat SectionCard variant applied UNIFORMLY across all cards (calm, document-like; glow on 7 stacked cards is noisy); never mix variants per card.
- Constrain forms column to max-w-2xl (~672px) inside PageShell max-w-6xl chrome; full-width below its breakpoint.
- 2:1 spacing rhythm: space-y-10 between groups, space-y-5 between cards within a group; prefer whitespace over Separator rules.
- No text effects anywhere: headings/titles plain solid text-foreground / text-muted-foreground; no gradient/clip/animation (honors memory + design constraint).
- Verify badge: solid-color token (verified vs unverified); ResendVerification inline ONLY when unverified.
- Customer address empty/first-run: render form with empty inputs + nudge subtitle ('Add a delivery address to speed up checkout'), not an empty-state illustration.
- Address grid sm:grid-cols-2 collapses to single column <sm; province is a Select (typed control per admin-typed-controls), never free text.
- Allergens multiselect keyboard-reachable: focus a selected Badge, Backspace/Delete removes; aria-live announces add/remove.
- Per-card save button w-full sm:w-auto (full-width thumb target on mobile).
- Notification Switch rows keep label-left/toggle-right; each row has helper text.
- Focus rings on every interactive control (inputs, switches, combobox trigger, buttons); inline field errors via form primitive with aria-live.
- Each SectionCard gets id={SECTION_META[key].id} + scroll-mt-24 so #hash deep-links land below the page header; update hash via history.replaceState only if you add in-page nav (none this pass).
- Disabled button reads intentionally inert (lower contrast, cursor-not-allowed), not broken.
- Consistent card title nouns so the page scans: Profile, Contact, Delivery address, Dietary & allergens, Delivery notes, Notifications, PIN, Password.
- Respect prefers-reduced-motion on any toast/opacity transitions; keep server component for data, client only for leaf form bodies (vercel-react-best-practices).

## Risks
- Role leak: a miswired config or a conditional render inside a shared card could expose staff PIN to user or hide customer fields. Mitigation: SECTION_GROUPS is the single gate (pin only in staff branch, address/dietary/etc only in user branch); add unit tests asserting the exact section set per Role (the design's Role-Gating Review dimension).
- Moving the leaf forms into components/account/leaves/ can break the colocated server-action imports (actions.ts, avatar-actions.ts live in the route folder) and existing smoke tests (avatar-field, change-password-form, pin-section). Mitigation: move presentational files only, keep actions in the route folder, update import paths, run the existing test suite green before cutover.
- Customer scroll length: 7 cards is ~3 viewport heights; returning to edit one field means scrolling. Mitigation this pass = narrow max-w-2xl column + Delivery grouping + per-card saves keep it a focused checklist; documented trigger to add C's sticky jump rail is when the field set grows (multiple addresses / payment / subscription).
- Live seeded DB migration: new columns must be additive + nullable (booleans default true/false) via db:generate; never hand-write, never drop usr_system fixture (live-db-test-harness memory).
- Allergens multiselect is the one shadcn gap (hand-built Command+Popover+Badge). Risk of inconsistent keyboard/touch behavior; keep on the same card as dietary_notes and cover with a focused interaction test. Popover acceptable for v1; consider Sheet on mobile if it crowds the viewport.
- Optimistic save + revalidatePath race: if the action rejects after the local reset, the card must roll back to prior values and toast.error; ensure each section keeps the pre-submit snapshot to revert.
- Customer /dashboard landing double-chrome: render the welcome block full-width and only the account region in the constrained column so the shared component never stacks awkwardly beside the app Sidebar.
