# Design v3: notes

Design artifacts only. Nothing under `apps/`, `tests/` or `packages/` was edited, nothing was built, nothing was committed.

## Files

| File | States (`file.html#state`) |
|---|---|
| `table.html` | `default` `fields` `filter` `sort` `field` `more` `group` `select` `sheet` `empty` `noresult` `loading` `light` |
| `ticket-resources.html` | `list` `expanded` `link` `sheet` |
| `dashboards.html` | `view` `add` `empty` `list` |
| `sidebar.html` | `expanded` `org` `account` `rail` `axis` |
| `table-phone.html` | `default` `filter` `menu` `row` |
| `DESIGN-SYSTEM.md` | tokens, component inventory, rules, migration |
| `png/` | one render per state, plus `receipt.json` (sha256 of the HTML rendered, measurements, assertion results). `src/check.py` reports when it no longer matches the HTML |
| `src/` | generator and checks (below) |

The HTML is generated. Edit `src/kit.css`, `src/lib.py`, `src/gen.py` or `src/pages.py`, then run `python3 src/gen.py`. A hand edit to an `.html` file is reported by `src/check.py` as stale.

To show one state without clicking: open `file.html#state`, or change `<body data-view="…">` to the state id. The state switch needs the inline script (it also pins the hover and edit demos on).

Every count, sum and percentage comes from one fixture: 87 rows of "Pilot batch log" in `src/lib.py`, fixed reference date Nov 11, 2026. Hover affordances (row checkbox + Open, footer Calculate, panel edit, resource row actions) and one cell in edit mode are pinned visible so a static frame can show them; the note under each mock says which.

## Borrowed from

Pages read for this work (text only):

- [S] <https://nocodb.com/docs/product/tables/fields/field-summary-footer>
- [G] <https://nocodb.com/docs/product/tables/table-operations/group-by>
- [E] <https://nocodb.com/docs/product/records/expand-record>
- [NT] <https://www.notion.com/help/tables>
- [NV] <https://www.notion.com/help/views-filters-and-sorts>

The NocoDB grid page in the brief (`…/views/view-types/grid`) returned one intro paragraph and headings. **No screenshot of either product was looked at**, so nothing here is a claim about how they look. Rows marked [brief] follow the task brief's description, not a source checked here.

| Reference | Our element | Source |
|---|---|---|
| NocoDB: summary is off by default; click the footer cell of a field, pick a type; "None" turns it off | Footer cell shows "Calculate" on hover; click opens the function menu (`#default`, `#group`) | [S] |
| NocoDB numeric: Sum, Minimum, Maximum, Average, Median, Range; general: Filled, Empty, Unique. Notion lists the same family (Sum, Average, Median, Min, Max, Range, count and percent variants) | Same list in the Cost menu. Left out: Standard Deviation and the Percent variants (the percent is shown beside the Filled count) | [S] [NT] |
| NocoDB: ticking row checkboxes makes the footer calculate over the selection only | `#select`: footer reads "3 of 87 selected" with Sum, Unique, Filled for those rows | [S] |
| NocoDB: summary configuration is per grid view | Summaries belong to the view tab | [S] |
| NocoDB: click a group header to collapse or expand; aggregations per group | Group header: chevron, chip, row count, the same summaries in their columns (`#group`) | [G] |
| NocoDB: a record added inside a group gets the group's value (documented for link-field groups) | "New row in In QA" under the open group | [G], extended to select fields |
| NocoDB: "In the toolbar, click Group By" | Group as a toolbar button | [G] |
| NocoDB toolbar: Fields / Filter / Sort as compact buttons; popovers of stacked rows (field, operator, value, trash) with "+ Add filter" | Toolbar and the popovers (`#fields` `#filter` `#sort`) | [brief] |
| NocoDB expanded record header: Previous / Next (following the view's filters and sort), Copy record URL, More options, Close | Row sheet header: same four controls, plus "Row 5 of 87" (`#sheet`) | [E] |
| Notion: table pages open in **side peek** by default. NocoDB's expanded record is a **modal**, not a side panel as the brief says | Row detail is a right side sheet | [NV]; contradicts [brief] on NocoDB, see [E] |
| NocoDB: hover the index column and click the expand icon | "Open" appears on hover at the end of the first cell (the index cell holds the checkbox) | [E], placement is ours |
| Notion: hover a row and tick the checkbox that appears; a menu then edits properties for the selected rows; header checkbox selects all | Hover checkbox, header checkbox, bulk bar with "Set field" | [NT] |
| Notion: "+" next to the views adds a view; each view has its own settings | View tabs with "+" after the breadcrumb | [NV] |
| Notion: a filter or sort is personal unless "Save for everyone" is chosen | Not drawn. It is open question 2 | [NV] |
| Notion: click a property name for its menu (Wrap text, Calculate, Freeze up to column) | Field header menu (`#field`). Its items (edit, change type, sort, filter, group, hide, delete) | menu: [NT] [NV]; items: [brief] |
| Notion: search from the top of the database; freeze a column | Search in the toolbar; first column always sticky | [NV] |
| NocoDB: grid data can be exported to CSV | Export CSV. Its place in the "⋯" menu, with Import, density and delete | export: grid page; placement: [brief] |
| NocoDB: row count at the bottom-left; "+" header cell at the end of the header row; link fields as chips | Footer count; add-field cell; ticket and row chips | [brief] |
| Notion: "+ New" under the last row; quiet chrome, hairline borders, hover-revealed affordances | "New row" under the last row; no card around the grid, 1px borders | [brief] |
| Kaneo Boards: breadcrumb header, segmented filter chip | Same 44px header; `ActiveFilterChip` reused for applied filters | `board-layout.tsx:161`, `board-toolbar.tsx:121` |

Deliberately not copied: more than one group level (NocoDB allows five; approved scope is one), the group header "…" menu, dragging rows between groups, and a split "New ▾" button (one plain primary button instead).

## Before → after

| Area | Today | v3 |
|---|---|---|
| Table page header | 40px icon tile + 24px editable title inside `p-4 sm:p-6` (`table/$tableId.tsx:130-152`) | 44px breadcrumb header with a table switcher, same as Boards. Rename moves to the table menu |
| Grid container | card inside the page: `rounded-xl border bg-card shadow-sm` (`data-table-grid.tsx:743`) | grid sits directly on the page surface |
| Toolbar | wrapping row: search, filter chips, dashed "+ Filter" pill, counts, "Density: Compact" button (`:744-850`) | one 40px row: Fields, Filter, Sort, Group, then search, "⋯", New row |
| Filter | pick a field from a list behind an 11px dashed "+ Filter" pill, then edit a chip | popover of condition rows; applied filters repeat as chips in a 36px row with Clear filters |
| Sort | click a header to cycle | Sort popover and the field header menu; the sorted column shows an arrow |
| Group, summaries, view tabs | not present | present (scope approved in the v2 mock) |
| Add row | text link in the bottom bar | "New row" under the last row, plus the toolbar button |
| Add field | text link in the bottom bar | "+" at the end of the header row |
| Import / Export CSV | text links in the bottom bar (`:1047-1075`) | table "⋯" menu |
| Density | toolbar button | "Row height" in the table menu; rows 32 / 40px (today 36 / 44) |
| Delete row | red trash replaces the row number on hover | select → bulk bar, or the row sheet menu |
| Footer | grey bar of links | 32px: honest count on the left, per-column summaries |
| Row detail | none | 480px side sheet: fields, linked tickets, linked rows, row ID |
| Ticket detail | Resources lists GitHub issues and pull requests, links and images (`task/task-resources.tsx`) | adds "Table rows": expand a row inline (read-only), "Open row" to edit, "Link table row" |
| Dashboards | own header (icon tile, 24px title), dashed "Soon" chips, outline buttons in the title row, panels `rounded-xl p-4`, 16px gaps | same header and toolbar as Tables; panels 12px padding and gaps; edit and more on hover |
| Sidebar identity | 32px avatar with overlapping team badge, two lines | 32px, one line: org tile, team, org. **The team badge on the avatar is gone** |
| Sidebar footer | 32px avatar button, hidden on the collapsed rail | 40px row: avatar, name, email. On the rail the avatar stays, so the account menu is reachable |
| Collapsed rail | 28px toggle, 32px search buttons, 32px avatar; header laid out as a row | every control 28px on one centre axis, 4px apart |
| Dark surfaces | sidebar and card `#131315`, background `#0a0a0b` | sidebar < background < card < popover |
| Accent | none (primary is grey) | one indigo accent: primary action, focus, selection, "applied" tint |

Members and Settings stay where they are (two rows above the identity row); folding them into the account menu was considered and not done, because it costs a click each.

Not drawn, and not decided by this work: the "Alpha" badge on the Tables section (8px today, below the new floor), the Work / Resources mode switch, the Recent sub-list.

## What the API cannot serve today

Checked against `apps/api/src/data-table/index.ts` (routes), `fields.ts` and `apps/web/src/types/data-table.ts`.

| Design element | Gap |
|---|---|
| View tabs; saved filters, sort, group, hidden fields, summaries | no view resource. Today sort, filters and density are client state |
| Linked tickets field | no ticket-link field type. `link` (link to table, `targetTableId`) exists (`fields.ts:114`) |
| Ticket → linked rows | no reverse lookup found (grep of `apps/api/src/task/*.ts`, top level only, for table rows: nothing) |
| Bulk bar (set field, delete, link) | row routes are single-row: `POST /rows`, `DELETE /rows/:rowId`, `PUT /rows/:rowId/cells/:fieldId` |
| "5 with access" avatars | `BoardAccessAvatars` accepts `board` and `repo` only (`board-access-avatars.tsx:23`) |
| Summaries and group totals | drawn as computed over loaded rows (the row page is 1000). Above that the footer must say "of N loaded" or use `POST /:tableId/query` |
| Row "Created by" | rows carry `createdAt` and `updatedAt`, no author. The sheet shows dates only |

## Checks that ran

| Check | Result | What it does not show |
|---|---|---|
| `python3 src/check.py` (static, local) | pass. Fails on planted violations: off-scale font size, radius, padding, raw colour, a unicode glyph, a hand-edited file | layout |
| `src/render.py` on the build host (headless Chromium, 1344px and 440px viewports), run with `fxrun --pull png/ -- 'bash src/render.sh'` | 30 states rendered, 0 failed assertions | taste |
| Negative control: `src/negctl.py` plants 8 defects in a scratch copy | all 8 detected, run exits 1 | defect classes it does not plant |
| Vision review of the PNGs | 29 of 30 states looked at at least once (`sidebar#rail` only through `#axis`); each fix was looked at again in the state it changed. After the last change (colour only: avatar tint and the light-theme chip colours) only `table#default` and `table#light` were looked at again | this was the author reviewing its own work |

`render.py` asserts, per state: no sideways document scroll, the bundled font loaded, no clipped or spilling text, bar children inside and on one centre line, floating layers inside the frame, body cells on their header columns, summaries inside their column, an open popover's trigger marked open, one primary button per view, rail controls 28×28 on the axis with 4px gaps, targets at least 24px (44px on the phone), no text under 12px, the state's subject actually on screen, and no two states painting identical pixels.

Defects the render pass and the vision review found and that were fixed: keycap chips stretched and the search placeholder wrapped; "Sum" spilling out of the Cost column; opening the field menu hid its own header cell and shifted the columns; the Link picker state rendered no picker; two primary buttons on the empty dashboard; an edit caret behind every Cost value; icon-less menu items on a different text edge; skeleton bars left-aligned under a right-aligned header.

Known and left as is:

- The line chart has no y-axis labels (the peak is stated in the subtitle).
- Owner avatars and stage chips draw from the same six tones, so a blue avatar can sit beside a blue "Mixing" chip and read as related. Not resolved.
- The Add panel dialog shows title, type, source, metric, group by and width; per-panel filters exist in the type (`QuerySpec.filters`) and are not drawn.

Still open: an independent reviewer has not seen this. No real app screen was rendered. The new token names (`text-ui`, `bg-primary-soft`, `text-faint-foreground`, `bg-row-hover`) are untested against Tailwind v4.

## Open questions for the owner

1. **Accent colour.** The mocks use indigo `#5e6ad2` as the one accent. Today `--primary` is grey, so the app has no accent. Changing `--primary` recolours every primary button, link and focus ring in the app at once. Indigo, another hue, or stay neutral and mark selection with a stronger grey?
2. **Are views shared or personal?** The tabs ("All batches", "By stage") each hold filters, sort, group, hidden fields and summaries. Stored in the browser, nobody else sees your "By stage" and it is gone on another device, but it needs no API work and matches the earlier ruling that view state is device-local. Stored on the server, the team shares them; that needs a view resource and a rule for who may change a shared view.
3. **Deleting a row takes two steps.** The hover trash on the row number is gone, because that cell now holds the checkbox. Delete is: tick the row, then Delete in the bulk bar (or open the row and use its menu). Accept the extra click, or keep a one-click delete on hover?
4. **Phone is a record list, not a grid.** At 390px each row is a two-line record and a tap opens it full screen. That keeps every target at 44px and needs no sideways scrolling, but there is no inline cell editing, no summary footer and no group totals on a phone. Good enough, or should the phone get the scrolling grid?
5. **Sidebar identity: one line or two?** The mock puts team and org on one 32px line ("Platform  Noovoleum") and drops the small team badge on the org avatar, which came from your earlier sketch. One line is the most compact, but with long names the org name is the first thing to truncate. The alternative is 36px with two 12px lines and the badge kept: 4px taller, nothing truncates sooner than today. Which?
