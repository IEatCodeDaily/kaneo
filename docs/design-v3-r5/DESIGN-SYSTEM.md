# Kaneo design system v3

Status: proposal, not implemented. Nothing under `apps/` was changed. The mocks in this folder are built from exactly these tokens (`src/kit.css`, top block) and `src/check.py` fails if a mock leaves them.

The owner's recurring complaint is gap and padding drift. The cause is measurable: every page picks its own values from an unbounded set. This document closes the set and moves page padding out of the pages.

## 0. What the code does today (measured in `apps/web/src/components` + `routes`)

| Dimension | In use today | Evidence |
|---|---|---|
| Font sizes | at least 14 sizes. 187 uses below 12px (`text-[11px]` 58, `text-[10px]` 86, `text-[9px]` 29, `text-[8px]` 13, `text-[7px]` 1) | e.g. `nav-tables.tsx:56` (8px "Alpha"), `data-table-grid.tsx:783` (11px) |
| `text-md` | 17 uses; not defined in `index.css` | e.g. `task-details-content.tsx:132`. Tailwind's default scale has no `md` step, so this class likely emits nothing (not checked against the installed package) |
| Radii | 7 (`rounded` 141, `-sm` 20, `-md` 317, `-lg` 90, `-xl` 56, `-2xl` 11, `-full` 150) | `index.css:113-116`, `--radius: 0.625rem` at `:151` |
| Gaps | at least 11 steps including half-steps (`gap-0.5` 34, `gap-1.5` 190, `gap-2.5` 11, `gap-5` 7) | across all of `apps/web/src`, 281 lines in `*.tsx` use one of `gap-0.5`, `gap-2.5`, `gap-5`, `px-1.5`, `px-2.5`, `py-0.5`, `py-1.5`, `py-2.5`, `p-0.5` |
| Control heights | every step from `h-5` to `h-11` is in use (7 heights) | `ui/button.tsx:19-30` already defines 24/28/32 on desktop (`xs`/`sm`/`default`) |
| Page header | 3 different ones | Boards: sticky `h-11` breadcrumb header (`board-layout.tsx:161`). `Layout.Header` default: `h-10`, shrinks to `h-8` when the sidebar is collapsed (`layout.tsx:35`). Tables and Dashboards: no header, a 40px icon tile + `text-2xl` title inside `p-4 sm:p-6 gap-5` (`table/$tableId.tsx:130-152`, `dashboards/$dashboardId.tsx:180-186`) |
| Dark surfaces | sidebar `#131315` = card `#131315`, both lighter than background `#0a0a0b` | `index.css:213,215,241`. The sidebar is the lightest surface; the brief wants it darkest |
| Accent | none. `--primary` is grey (`#c9c9c9` dark, `#2a2a2e` light) | `index.css:175,227` |
| Icons as text | `"✓"` character as a checkbox mark | `board-toolbar.tsx:109` |

## 1. Tokens

Names are the existing `index.css` variables wherever one exists. "New" means it has to be added. Tailwind v4 reads `@theme` variables as utilities; the utility names below assume that and must be confirmed in the first build.

### 1.1 Colour

| Token | Dark | Light | Tailwind | Change vs today |
|---|---|---|---|---|
| `--sidebar` | `#0b0b0d` | `#efeff1` | `bg-sidebar` | was `#131315` / `#ffffff`: now the darkest step |
| `--background` | `#111113` | `#fafafb` | `bg-background` | was `#0a0a0b` / `#f6f6f7` |
| `--card` | `#17171a` | `#ffffff` | `bg-card` | was `#131315` |
| `--popover` | `#1c1c20` | `#ffffff` | `bg-popover` | was `#131315`: popovers now sit above cards |
| `--foreground` | `#e8e8eb` | `#18181b` | `text-foreground` | minor |
| `--muted-foreground` | `#9c9ca3` | `#5f5f67` | `text-muted-foreground` | minor |
| `--faint-foreground` | `#85858d` | `#66666e` | `text-faint-foreground` | **new**. Replaces every `text-foreground/30…/70` opacity variant |
| `--border` | `#242428` | `#e6e6e9` | `border-border` | hairlines: rows, cells, page rows |
| `--input` | `#34343a` | `#d3d3d8` | `border-input` | was an alpha value. Control outlines, popover edges |
| `--accent` | white 5% | black 4% | `bg-accent` | hover fill |
| `--secondary` | white 9% | black 7% | `bg-secondary` | pressed / current / open fill |
| `--primary` | `#5e6ad2` | `#5e6ad2` | `bg-primary` | **was grey**. The one accent. See NOTES open question 1 |
| `--primary-foreground` | `#ffffff` | `#ffffff` | `text-primary-foreground` | |
| `--ring` | `var(--primary)` | `var(--primary)` | `ring-ring`, `outline-ring` | **was neutral grey** (`index.css:177,229`). Focus = `outline: 2px solid var(--ring); outline-offset: -2px` (inset, so grid cells and rows never clip it). Drawn on `table.html#default` (Group button) |
| `--primary-soft` | accent 18% | accent 12% | `bg-primary-soft` | **new**. "A filter/sort/group is applied" tint |
| `--primary-soft-foreground` | `#aab3f8` | `#434fb3` | `text-primary-soft-foreground` | **new** |
| `--destructive-foreground` | `#f28b82` | `#b3261e` | `text-destructive-foreground` | retuned. Deliberately the same hue as `--tone-red` (ΔE_ok ≈ 0.03): a failed state and a destructive action both read "bad"; they never share a control |
| `--tone-gray/blue/pink/amber/green/red` | `#9c9ca3 #4fc3dc #f07ab8 #e3b341 #56c288 #f0806a` | `#57575f #004a5e #9e1f67 #764f00 #166439 #a3221b` | `text-tone-*` | **new**. The only colours a status chip or avatar may use. All hues are OKLCH. No tone sits near the accent hue (275°): violet was replaced by pink (349°) and blue moved to cyan (≈215°, token name kept); every tone pair is ≥ 0.10 ΔE_ok apart (check.py) so a status chip never reads as "selected". Light tones pass 4.5:1 on their tint over a selected row |
| `--row-hover`, `--row-selected` | 4% foreground / 14% primary mixed into background | same formula | `bg-row-hover`, `bg-row-selected` | **new**. Opaque on purpose: sticky cells must not show through |

Checked by `src/check.py` in both themes: every text token on every surface is at least 4.5:1 (worst case 4.64:1, faint text on popover, dark); white on `--primary` is 4.70:1; checkbox outline and focus ring are at least 3:1. Tinted surfaces are checked too: a chip or avatar is its tone on a 16% tint of itself, plus text on hover and selected rows; worst case 4.54:1 (faint text on a selected row, dark).

Separators: row hairlines and bar separators use `--border`; sticky footers and floating-layer edges (popover, dialog, bulk bar) use `--input`, because they sit over scrolling content and need the stronger edge.

Surface steps are deliberately small (about 1.05:1 between neighbours in dark; in light, card and popover are both white and a popover is set apart by its border and shadow). Separation is carried by the 1px borders, not by fill contrast.

### 1.2 Spacing: 4px base, six steps

| Token | px | Tailwind | Use |
|---|---|---|---|
| `--space-1` | 4 | `gap-1 p-1` | between controls in one group; menu padding |
| `--space-2` | 8 | `gap-2 px-2` | control padding; cell padding; icon to label in rows |
| `--space-3` | 12 | `gap-3 px-3` | page gutter; between groups; panel grid gap |
| `--space-4` | 16 | `gap-4 p-4` | content gutter; sheet and dialog padding |
| `--space-6` | 24 | `gap-6` | reading layouts only (ticket body: 24px vertical) |
| `--space-8` | 32 | `p-8` | empty states, and the horizontal gutter of reading layouts (ticket body) |

One exception: **6px (`gap-1.5`, `px-1.5`) is allowed only between an icon or avatar and its label, and as chip padding.** Everything else is off the scale: `0.5`, `2.5`, `3.5`, `5`, `7`, and every `[Npx]` value.

### 1.3 Control heights

| Token | px | Existing `Button` size | Use |
|---|---|---|---|
| `--control-sm` | 24 | `xs` | inside rows and cells, chips' remove button, sidebar nav rows |
| `--control-md` | 28 | `sm` | **default for all chrome**: toolbar, header, popover selects, menu items, sidebar resource rows |
| `--control-lg` | 32 | `default` | dialogs and forms only |
| phone | 44 | via the `pointer-coarse` hit area already in `ui/button.tsx:11` | every target on touch |

Chips are 20px and are not controls.

### 1.4 Page scaffold

| Token | px | What it is |
|---|---|---|
| `--header-h` | 44 | breadcrumb row. Same as Boards today (`h-11`). Does not shrink when the sidebar collapses |
| `--toolbar-h` | 40 | one row: view controls left, search + overflow + the one primary action right |
| condition row | 36 | only when filters are applied: 24px chips |
| group header | 36 | grouped grid: chevron, chip, count, per-column summaries |
| `--row-h` | 32 | grid row, list row (Comfortable: 40) |
| `--footer-h` | 32 | count + summaries, sticky bottom |
| `--page-gutter` | 12 | horizontal padding of header, toolbar, condition row, footer |
| `--content-gutter` | 16 | padding of non-grid content (dashboard panel area, sheet body, ticket properties rail) |
| `--label-col` | 132 | label column of every label:value list (row sheet, ticket resources expanded row, dialogs). The 280px ticket properties rail overrides it to 96 on its container; the 560 dialog and the phone full-screen row use 112. Nothing else may |
| `--bulk-clear` | 88 | bottom padding of a grid while a selection exists, so the bulk bar (40px, 48px above the bottom) never covers the last rows |
| phone header / footer | 52 / 60 | the 390px scaffold: 44px targets + 8px; no other phone bar heights |
| popover widths | 208 / 240 / 256 / 280 / 400 / 420 / 548 / 560 | field menu min 208 (content-driven) · menus 240 · sidebar identity menus 256 (overhang the 240 sidebar; portal outside its scroller) · Fields 280 · Sort 400 · row picker 420 · Filter 548 · dialog 560 (52px footer). No other floating widths |

Text edge rule: a ghost control at the gutter has 8px padding, so chrome text starts at gutter + 8 = 20px. Plain text placed in the toolbar gets the same 8px. List content aligns to that edge.

### 1.5 Type

| Token | px / line | Tailwind | Use |
|---|---|---|---|
| `--text-xs` | 12 / 16 | `text-xs` | counts, column headers, section labels, chips, hints. **Floor: nothing smaller** |
| `--text-ui` | 13 / 18 | `text-ui` (**new**) | body of all dense UI: cells, buttons, menus, nav |
| `--text-sm` | 14 / 20 | `text-sm` | dialog titles, empty-state titles, reading text |
| `--text-base` | 16 / 24 | `text-base` | (reserved) |
| `--text-xl` | 20 / 28 | `text-xl` | ticket title, row-sheet title |
| `--text-2xl` | 24 / 32 | `text-2xl` | dashboard stat value only |

Weights: 400 body, 500 labels and current items, 600 titles. Numbers that line up use `tabular-nums`. IDs use `--font-mono` at 12px, muted, as a prefix before the name (grid first cell, sheet title): `PB-1042  Filter test A`. Currency units appear once, in the field header (`Cost  Rp`); summaries and grid cells show the bare tabular number. All numbers, currency and dates go through the platform `Intl` formatters with the viewer's locale (`Intl.NumberFormat(locale, { style: "currency", currency })`, as `data-table-format.ts` already does); separators are never hand-written, and the commas in these mocks are illustrative. Dates in the current year drop the year (`Nov 10`). App chrome titles use `--font-sans` 600; `--font-heading` stays for auth and marketing surfaces (today `index.css:270-277` applies it to every `h1`–`h6`).

### 1.6 Radius: three values

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 4 | chips, checkboxes, keycaps, logo tile |
| `--radius-md` | 6 | every control, menu item, input |
| `--radius-lg` | 10 | containers: popover, dialog, panel card, the app inset |

Plus `rounded-full` for avatars and switch tracks only. `rounded`, `rounded-xl`, `rounded-2xl` go away.

### 1.7 Icons

lucide, stroke 1.75. **14px** everywhere in chrome, including icon-only ghost buttons (24/28px). **16px** only in square tiles (rail squares, 44px phone targets, empty-state tile). Two named exceptions, and no others: **10px** for the glyph inside a 14px checkbox, **12px** for the grid row "Open" button. The CI check allows 10/12 only inside `.cb` / `Checkbox` and `size="xs"` buttons. No emoji, no unicode glyphs (arrows, checks, crosses, bullets) standing in for icons.

## 2. Component inventory

| Pattern | Built from (existing) | Rule |
|---|---|---|
| Page header | `common/layout.tsx` `Layout.Header` + `common/header/*-crumb-select.tsx` | 44px. Crumbs: org / resource switcher. View tabs sit in this row after a divider |
| View tabs | `common/view-tabs.tsx` | 28px borderless pills; current = `bg-secondary`. Today it is a bordered `h-8` segmented box with `h-6` tabs |
| Page toolbar | `ui/toolbar.tsx` (`Toolbar`, `ToolbarButton`, `ToolbarGroup`, `ToolbarSeparator`) | 40px. One sub-component to add: `Layout.Toolbar`, which owns height, gutter and gap |
| Toolbar button | `ui/button.tsx` `variant="ghost" size="sm"` | resting = ghost. Applied (has conditions) = `bg-primary-soft` + count. **Fields is applied when any field is hidden** (badge "1 hidden"), so a badge always means the view is narrowed. Popover open = `bg-secondary`; applied and open = soft + 1px `--input` edge. A `--primary` outline means keyboard focus and nothing else |
| Primary action | `ui/button.tsx` `variant="default" size="sm"` | **one per view**, right end of the toolbar. Empty-state actions are `outline` |
| Condition popover | `ui/popover.tsx` + `ui/select.tsx` / `ui/combobox.tsx` + `ui/input.tsx` | stacked rows on one grid: word · field · operator · value · trash. Footer: add left, clear right |
| Active filter chip | `ActiveFilterChip` in `board/board-toolbar.tsx:121-146` | move to a shared file, 24px, reuse on Tables. Same chip on Boards |
| Menu | `ui/menu.tsx` | 28px items, 14px icon column kept even for icon-less items, group labels 12px, destructive last after a separator |
| Status chip | `ui/badge.tsx` | **the only chip**: 20px, dot + word, one of six tones. Replaces per-feature pills and `chipStyle` in `data-table-cells.tsx:80` |
| Key chip (KFL-412) | `ui/badge.tsx` `variant="outline"` | 20px, mono 12px |
| Keycap | `ui/kbd.tsx` | 18px, 12px text |
| Grid | `components/data-table/*` (keep virtualization, editors, CSV) | hairline cells, sticky header, sticky first two columns, sticky footer |
| Row hover affordances | `ui/checkbox.tsx`, `Button size="xs"` | row number becomes a checkbox; an icon-only "Open row" button appears at the end of the first cell |
| Bulk bar | `bulk-selection/bulk-toolbar.tsx` | reuse the ticket bulk bar: count, actions, destructive last, clear |
| Row sheet | `ui/sheet.tsx` side right, pattern of `task/task-details-sheet.tsx` | 480px, 44px header, 132px label column |
| Empty state | `ui/empty.tsx` | bordered 32px icon tile, 14px title, one sentence, outline actions |
| Loading | `ui/skeleton.tsx` | skeleton rows on the real column grid, toolbar disabled, footer says "Loading rows" |
| Panel card | `dashboard/panel-card.tsx` | `rounded-lg border bg-card`, 36px title row, 12px padding, edit/more on hover. Today: `rounded-xl p-4 gap-3` (`:78`) |
| Sidebar | `ui/sidebar.tsx`, `app-sidebar.tsx`, `org-team-selector.tsx`, `user-avatar.tsx` | section 4 |
| Phone sheets | `ui/sheet.tsx` side bottom | popovers and menus become bottom sheets; 44px rows |

## 3. Rules engineers can enforce

Do:

1. Take every size from section 1. If a value is missing, add a token here first.
2. Let the scaffold own padding. A route renders `Layout.Header`, `Layout.Toolbar`, `Layout.Content`; the route root has no `p-*` or `gap-*`.
3. Use 28px controls in chrome, 14px icons, 13px text, 12px for secondary.
4. Show a count wherever rows are narrowed: "13 of 87 rows", "3 of 87 selected". If not all rows are loaded, say "of N loaded".
5. Put rare actions (import, export, density, rename, delete) in the overflow menu.
6. Reveal secondary actions on hover and on keyboard focus (`group-hover` plus `group-focus-within`). Two placements only: the grid's first cell **reserves** room on hover (`--open-clear`, the name ellipsizes); list rows **swap** their trailing meta (chip/state) for the actions in the same slot. Never reserve hidden space at rest.

Don't:

1. No text below 12px. No `text-[Npx]`.
2. No radius outside `rounded-sm/md/lg/full`.
3. No half-step spacing outside a control. No `[Npx]` spacing.
4. No card inside the page inset. The inset is the surface; grids and lists sit on it directly (today `data-table-grid.tsx:743` wraps the grid in `rounded-xl border bg-card shadow-sm`).
5. No second filled button in a view. No tinted backgrounds except `--primary-soft`, `--row-selected` and chips.
6. No colour from outside the tokens. No opacity variants of text colours.
7. No unicode glyphs as icons.
8. No header that changes height with sidebar state.

Enforcement: one grep-based check in CI with the same rules as `src/check.py` (font-size floor, radius set, spacing scale, raw colours, glyph ranges). About 40 lines; no lint plugin needed.

Scope: the check runs on `src/components/**` and `src/routes/**` **excluding `src/components/ui/**`**. The `ui/*` primitives hold 742 arbitrary-value classes across 47 files (vendored coss/shadcn arithmetic such as `px-[calc(--spacing(2.5)-1px)]`); they are reviewed once in migration step 1b and are then owned as the place where raw arithmetic is allowed. Feature code may only compose primitives and tokens.

## 4. Sidebar

| Part | Today | v3 |
|---|---|---|
| Org + team identity | 32px avatar with overlapping team badge, two text lines, `h-auto` (`org-team-selector.tsx:177,191`) | **32px, one line**: 20px org tile, team name (500), org name (muted), switcher chevrons |
| Text column | identity text +4px, account text +8px off the nav labels (measured on v3-r1) | **one text column**: identity and account rows use `px-1 gap-1.5` with a 20px leading tile, so their text starts on the same x as the nav labels (about 40px) |
| Search row | 32px input + 32px square (`search.tsx:109,129`) | 28px input + 28px square |
| Primary nav rows | 24px (`nav-main.tsx:85`) | 24px, unchanged |
| Resource rows | Tables 32px (`nav-tables.tsx:103`); the other sections were not re-measured | 28px for all four sections |
| Section "+" | absolute-positioned 24px | 24px in the label row, on hover/focus |
| Members, Settings | two 32px rows; Settings keeps its label on the rail (`app-sidebar.tsx:172`) | two 24px rows, unchanged position; icon-only on the rail |
| User identity | 32px avatar-only button, hidden on the rail (`user-avatar.tsx:70`, `app-sidebar.tsx:175`) | **40px row**: 20px avatar, name, email, chevrons; opens the existing account menu. On the rail: the avatar in a 28px square, so the menu stays reachable |
| Rail width | 40px (`ui/sidebar.tsx:35`) | 44px |
| Rail controls | three sizes on one rail: 28px toggle (`ui/sidebar.tsx:291`), 32px search buttons (`search.tsx:62,80`), 32px org avatar with badge. Header is a row, so the selector and toggle sit side by side (`app-sidebar.tsx:88-91`) | **every control is a 28px square on the centre axis**, stacked; 4px between controls, 12px between groups |

`src/render.py` asserts the rail geometry (axis, 28×28, 4px gaps) on the rendered page.

## 5. Migration notes

Order matters: tokens first, scaffold second, then one surface at a time.

1. **`index.css`**: replace the colour values in `:root` and `.dark` per 1.1; add the new tokens and their `@theme inline` mappings; add `--text-ui`; pin `--radius-sm/md/lg` to 4/6/10 instead of the `calc()` chain and drop `--radius-xl`. This recolours every `bg-primary`, `text-primary` and `border-primary` at once (up to 84, 65 and 27 uses; the counts include `-foreground` variants): review those before merging.
1b. **Primitives**, before any surface: the cva bases of `ui/button.tsx:11`, `ui/input.tsx:69`, `ui/select.tsx:19` and `ui/menu.tsx:97,121,177,262` use `rounded-lg` and `text-base sm:text-sm`, so without this step every control stays 10px-radius and 14px text and the system never lands. Change `rounded-lg`→`rounded-md` and `text-base sm:text-sm`→`text-ui` (keep `text-base` on `pointer-coarse` for iOS zoom). Grep the test tree for those literals first (`ui/sidebar-density.test.tsx`-style asserts).
2. **Scaffold**: add `Layout.Toolbar`; fix `Layout.Header` at 44px and remove the collapse rule (`layout.tsx:35`).
3. **Tables**: route loses its own header, icon tile and padding (`table/$tableId.tsx:130-182`); breadcrumb gets a table switcher like `board-crumb-select.tsx`. Grid loses the card wrapper (`data-table-grid.tsx:743`), the wrapping toolbar (`:744-850`) and the link footer (`:1018-1100`). Row heights `DENSITY_ROW_HEIGHT` 36/44 become 32/40 (`data-table-format.ts:422`). Row delete moves from the hover trash in the row-number cell to the bulk bar and the row sheet menu.
4. **Dashboards**: same scaffold; remove the icon tile, `text-2xl` title and the two dashed "Soon" chips (`dashboards/$dashboardId.tsx:183-198`); `panel-card.tsx:78` and the 16px grid gap move to 12px.
5. **Boards**: `ActiveFilterChip` becomes shared; `"✓"` at `board-toolbar.tsx:109` becomes the lucide check; view tabs restyled once in `view-tabs.tsx`.
6. **Sidebar**: section 4.
6b. **Stored select colours**: `SelectChoice.color` holds raw hex today (8-colour picker, `field-options-dialog.tsx:33-41`). No data rewrite: chips render `tone = nearestTone(choice.color)` at read time (nearest by hue in OKLCH; cyan/blue→blue (drawn cyan), yellow→amber, purple/violet→pink, unknown→gray). The picker offers the six tone ids, and new choices store the tone id. One unit test pins the mapping of the 8 legacy colours.
7. **Sweep**: replace the 187 sub-12px classes and the 17 `text-md`; map radii (`rounded` and `rounded-xl` to `md` or `lg`).

Before changing any size class, grep the test tree for it: tests assert literal classes (`ui/sidebar-density.test.tsx:23` pins `h-11 md:h-7 text-sm md:!text-xs`). `twMerge` does not drop a variant's breakpoint-prefixed twin, so change the variant, not a `className` override.

Not verified here: nothing was built or type-checked (design-only task). Token names that are new (`text-ui`, `bg-primary-soft`, `text-faint-foreground`, `bg-row-hover`) are proposals until the first build proves the `@theme` mapping.
