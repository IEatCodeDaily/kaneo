# Design v3 — implementation plan

Approved design: `docs/design-v3-r6/` in the session checkout (council r6: OPUS 8.8, GLM 8.7, both APPROVE). Tokens, rules and migration order: its `DESIGN-SYSTEM.md`. Leftover council items: its `.council/design-v3-r6/ADJUDICATION.md` (copied into the slices below).

Order is fixed by the design system's migration notes: tokens → primitives → scaffold → one surface at a time. Each slice is one PR, gated by CI + render acceptance + owner OK on screenshots.

| # | Slice | Scope | API work | Done when |
|---|---|---|---|---|
| S1 | Foundation | `index.css` tokens (§1.1 colours both themes, `--faint-foreground`, `--primary-soft`, `--row-hover/selected`, six `--tone-*`), radius pinned 4/6/10, `text-ui` 13/18; primitives `button/input/select/menu` → `rounded-md` + `text-ui` (keep `text-base` on coarse pointers); `Layout.Header` fixed 44px (no collapse shrink), `Layout.Toolbar` 40px | none | every page renders on the new tokens; no feature changes; tests that pin old classes updated |
| S2 | Table page + toolbar | route loses own header/tile/padding; breadcrumb table switcher; grid off the card; one 40px toolbar: Fields / Filter / Sort / Group popovers (stacked condition rows), search, `⋯` (import, export, row height, rename, delete), New row; `+` add-field header cell; "New row" under last row; row hover checkbox + icon-only Open; condition row with shared `ActiveFilterChip`; honest count footer | none (view state stays client-side, owner ruling) | `table.html` states `default fields filter sort field more empty noresult loading` match on the real page |
| S3 | Summaries, group, selection | footer summaries per field (off by default, NocoDB function set, selection-scoped); single-level group with collapsible headers + per-group summaries + "New row in <group>"; floating bulk bar (set field, delete, link) | **bulk row endpoint** (set field / delete N rows) or client loop over single-row routes with a `ponytail:` ceiling | `group`, `select` states |
| S4 | Row sheet + linking | 480px row sheet (fields, linked tickets, linked rows, Row ID copy, prev/next); `linkTicket` field type; ticket Resources gains "Table rows" (expand inline read-only, Open row, Link table row picker) | **`linkTicket` field type**; **ticket → rows reverse lookup** | `sheet`, `ticket-resources` states |
| S5 | Dashboards | same scaffold + toolbar; panels `rounded-lg p-3 gap-3`, edit/more on hover; chart y-label gutter sized from the widest label | none | `dashboards.html` states |
| S6 | Sidebar | §4 table: one-line identity, 40px account row, 28px rail controls on one axis, 44px rail | none | `sidebar.html` states; rail axis assertion |
| S7 | Phone | record list at 390px, full-screen row, bottom-sheet popovers, 44px targets | none | `table-phone.html` states |
| S8 | Sweep + CI check | port `src/check.py` rules to a ~40-line CI grep over `src/components/**`, `src/routes/**` excluding `ui/**`; sweep sub-12px text, `text-md`, stray radii | none | check green in CI |

## Carried from the council (land in the named slice)

- S2: header labels may ellipsize while hovered/open; unit and sort arrow never hidden (write the rule into the DS, align render 4h). Title-link centring via flex row + block ellipsis span, never `line-height` = row height. Hover reveal as a component slot (no descendant selectors). Tooltips via shadcn `Tooltip`, not `title`.
- S2: grid keyboard path to row Open — focusable cells (roving tabindex on the virtualized grid) so `focus-within` reveals it.
- S3: header-overlap check over every header; "Linked tickets" hover budget recheck.
- S4: "keep value on hover" derived from field type (currency/number/count); `.lr` rows get the row hover tint; phone `.lr` converges on the swap pattern when it gains actions; Row ID copy on phone; prev/next on phone (OPUS S6).
- S5: chart y-labels positioned from the scale, gutter from the widest label.
- S2/S4: primary-field lock + Fields search above 10 fields (OPUS S10).
- Open: "5 with access" avatars need an API (`BoardAccessAvatars` takes board/repo only) or are dropped from the header. Comfortable 40px density must be rendered once before it ships.

## Verification per slice

1. CI on the PR branch (lint, API unit + coverage, build, integration, docker).
2. Web typecheck (`tsc -p tsconfig.app.json`) and web vitest — not in CI today; run on fxbuilder, else a GitHub Actions job on the branch.
3. Render acceptance: built `apps/web/dist` + mocked API, desktop 1440 and phone 390, vision review, screenshots to the owner. Owner OK before merge.


## Status (2026-11-13)

- **S1** — merged (#45) + review fixes.
- **S2** — PR #46; review fixes landed (key per table, export hint, filter pruning, unit tests).
- **S3** — PR #48; blockers/should-fixes/nits all fixed (bulk-delete confirm, label resolution, tint, select-all scope, per-group aggregates).
- **S4** — PR #49; review blockers/should-fixes fixed at `4ec277ce6` (cross-org read, sheet draft, lattice, fail-closed URL, getRowById, unlink scope); verify pass running.
- **S5** — PR #50; dashboards on the v3 scaffold; gate green (23/23).
- **S6** — delivered inside S1's account-row slice (footer account row, rail centre axis render-asserted ≤2px, square Members/Settings, 32×32 org avatar). Account row is 32px on desktop / 44px on phone (sm:min-h-8) — the plan said 40px; screenshots were owner-approved at this height.
- **S7** — row sheet is full-width on phones (`w-full sm:w-[480px]`); phone shots render green. Remaining: bottom-sheet popovers on phone + a 44px touch-target pass — next small slice.
- **S8** — PR #52; design-lint CI check + full-source sweep; gate green.

Slice gate = MacBook full replay (lint · API unit · build · web types · web unit · integration on fresh PG16 · real-page render) + GLM review. GitHub Actions stays disabled account-side; the replay receipts live in `~/ci/receipts/<sha>/` on the Mac.
