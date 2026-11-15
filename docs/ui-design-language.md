# UI design language: enforced by construction

Status: decided 2026-11-14 · ticket KFL-395 · design source: design v3 r6 `DESIGN-SYSTEM.md` (session checkout, not committed; see `docs/plans/2026-11-12-design-v3-implementation.md`)

## Problem

Every class-level sweep of padding, type sizes and radii decayed. The trigger
case shows why: the Field options dialog body sat 0px from the dialog edge
while its header and footer had 24px. `DialogContent` had no padding; the inset
lived in a second component, `DialogPanel`, that the author had to remember.
27 of 35 dialog files did not. A rule that depends on memory is broken by the
next author, human or agent, who has not read the last review.

## Decision

Four layers, each catching what the one before it cannot.

1. **Primitives that are correct by default.** `Dialog`, `AlertDialog` and
   `Sheet` wrap their children in one padded body (`ui/overlay.ts`). Header and
   footer derive their bleed from the same CSS variable, so the three insets
   cannot disagree. `Popover` and `Card` own their padding the same way.
2. **No free `className` on layout-critical slots.** Popup, header and footer
   of the modal primitives (`CommandDialog` included) do not accept
   `className`; width is `size`, padding is `inset`. The type checker rejects
   drift before review (CI `web-checks`).
3. **A lint with proofs and a ratchet.** `scripts/design-lint.mjs` scans all of
   `apps/web/src`, carries `bad` and `good` probes per rule and runs them on
   every invocation, so a rule cannot go silently dead. Rules with a large
   legacy (off-scale spacing, `[Npx]` sizes, raw controls: 748 sites in
   feature code) are counted per file in a baseline whose rule totals can only
   shrink. The primitives are held to the same style rules through that
   baseline (148 legacy sites).
4. **Geometry asserted on the real app.** `tests/ui-render/render.mjs` opens
   the overlay states on a seeded instance and measures them from painted
   pixels. Each state asserts the subset that applies to it: header, body and
   footer inset, filled sticky bars, bar heights, widths.

A repo-local skill, `.agents/skills/kaneo-ui/SKILL.md`, tells an agent which
primitive to use for each pattern, with do and don't snippets.

## Values

| Token | Value | Source |
|---|---|---|
| Modal inset | 16px (`--space-4`, content gutter) | DESIGN-SYSTEM §1.2, §1.4 |
| Header / footer | 44px / 52px | §1.4; `pages.py` `.dlg` |
| Dialog widths | 400 · 560 · 768 | 560 from `pages.py` `.dlg`; 400 and 768 are house values (confirmation, existing picker width) |
| Body rhythm | 16px between children | house value: the gap is also the clearance under the header and over the footer, so it equals the inset. `.dlg-b` uses 8px between form rows; callers group tighter rows themselves |
| Sheet header inset | 16px | house value: `kit.css` `.sheet .ph` uses 12px, which puts the title 4px left of the body. One inset per surface wins |
| Row sheet | 480px | §2 |
| Popover inset | 4px menu · 8px panel | `kit.css` `.menu`, `.pop` |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32, and 6 for icon-to-label and chips | §1.2 |

## What we took from prior art

| Source | Idea | Where it landed |
|---|---|---|
| Stageshow [1] | A kit that "makes the hard parts hold up" rather than supplying a look | The primitives carry geometry; feature code carries content |
| Stageshow [1] | Scripts that measure: `layout.mjs` "checks that text and controls fit their boxes" | Inset and bar-height asserts in `render.mjs` |
| Stageshow [1] | Good and bad pairs side by side; "most rules came from reviewing real attempts, and each gives its reason" | Do / don't snippets in the skill; every lint rule prints its reason |
| Stageshow [1] | "When you correct a demo, ask the agent to add the note to the skill" | "Adding a rule" section: a review finding becomes a probe-backed rule |
| emilkowalski/skills [2] | Skills "list all the little mistakes agents can potentially make and explain how to fix them" | The skill's scale table names the wrong class next to the right one |
| emilkowalski/skills [2] | `pick-ui-library`: stop the agent from hand-rolling a component | "Which primitive" table; the hand-rolled control rule |

## Rejected, and when to revisit

| Option | Why not now | Revisit when |
|---|---|---|
| Component catalog route rendered every run | A second surface to keep in step with the app. The render run already opens the real dialogs on seeded data | A primitive has no real page that exercises it |
| Pixel-diff snapshots | Avatar tones hash a per-seed user id and fonts differ between the Mac gate and Linux runners, so diffs are noisy. Geometry asserts are deterministic | The seed is made deterministic |
| Spacing-token components (`Stack`, `Inset`) replacing spacing classes | About 3,000 class sites; the ratchet stops new drift at a fraction of the diff | The baseline stops shrinking on its own |
| Removing `className` from `Popover` and `Card` | Width and flex layout legitimately vary per caller | Padding drift reappears through another class |

## Known limits

- The ratchet counts per file, and `--update-baseline` compares rule totals.
  Moving an offender within a file passes, and an offender fixed in one file
  can be spent in another.
- `inset="none"` hands the inset back to the caller. It is meant for full-bleed
  panes; the lint cannot tell a legitimate pane from a workaround.
- A wrapper `<div>` that re-pads or bleeds a dialog body passes the types and
  the lint. Only the rendered overlay states catch it, and only for the
  surfaces they open.
- Floating edges use the default `--border` on every primitive (popover, menu,
  select, dialog, sheet). DESIGN-SYSTEM §1.1 asks for `--input`, and `kit.css`
  puts the sheet on `--card`. Not changed here: it restyles every floating
  surface and needs the owner's eye.
- 896 legacy offenders remain in the baseline (748 feature, 148 primitives).
  They are debt, not approval.

## Sources

1. Benji Taylor, "Stageshow", https://benji.org/stageshow (read 2026-11-14)
2. Emil Kowalski, "Skills for Designers and Engineers", https://github.com/emilkowalski/skills (read 2026-11-14)
3. Design v3 r6: `DESIGN-SYSTEM.md`, `src/kit.css`, `src/pages.py` (approved; kept in the session checkout, not in this repo)
