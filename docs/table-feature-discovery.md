# Table Feature — Discovery & Research

Status: discovery only. No implementation. Verdict on current feature ("truly truly shit") taken as the problem statement.

## 0. TL;DR

The shipped "Tables" feature is **not a table view of tickets**. It is a standalone free-form spreadsheet (Airtable-lite) with text-only cells, zero relation to the task model. That mismatch — not any individual UI flaw — is why it is bad. Everything a ticket table needs already exists in the schema and API (`taskTable`, per-field PUTs, `PATCH /bulk`, `getTasks` payload with labels/parent/assignee/dates); the right move is a **board-scoped ticket table view** reusing the list-view machinery, with the standalone spreadsheet deprecated or killed (owner call).

---

## 1. What exists today

Landed as `bc28b5862` "feat: add standalone data tables (#144)", gated behind `organization.tablesEnabled` (default false, `apps/api/src/database/schema.ts:187`).

**Web**
- Route: `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/table/$tableId.tsx` — rename table, delete table, render grid.
- Grid: `apps/web/src/components/data-table/data-table-grid.tsx` — div+input grid, add/rename/delete field, add/delete row, cell edit on blur.
- State: `apps/web/src/hooks/data-table/use-data-tables.ts` — react-query list/detail + 9 mutations, full-detail invalidation.
- Fetcher: `apps/web/src/fetchers/data-table/data-table.ts` — REST wrapper over `/data-table/organization/:orgId`.
- Sidebar: `apps/web/src/components/nav-tables.tsx` — hidden unless org flag on; create modal `apps/web/src/components/shared/modals/create-data-table-modal.tsx`.

**API**
- `apps/api/src/data-table/index.ts` — CRUD + fields/rows/cells, resource-privilege lattice (`view`/`edit`/`manage`), 404-not-403 for hidden tables.
- `apps/api/src/data-table/controllers.ts` — drizzle queries, position = max+1.
- `apps/api/src/data-table/require-tables-enabled.ts` — 404 when flag off.

**Schema** (`apps/api/src/database/schema.ts`)
- `data_table` 827–856, `data_table_field` 858–883, `data_table_row` 885–907, `data_table_cell` 909–929. No FK to `task` anywhere.

**Not present:** `repo/$repoId/table` — does not exist; tables are org-scoped only.

---

## 2. Defects, with evidence

**D1 — Fundamental: rows are not tickets.** `data_table_row` has no task relation (`schema.ts:885–907`); cells are opaque `text` (`schema.ts:918`). A user "tracking tickets" in a table maintains a second, manual ledger that silently drifts from the real tickets. This is the root defect; D2–D14 are consequences or aggravations.

**D2 — Text is the only field type, enforced twice.** DB CHECK `data_table_field_type_check` pins `type = 'text'` (`schema.ts:881`); API hardcodes `type: "text"` on create and guards updates/deletes on it (`controllers.ts:145,164,186,255`). Web type is the literal `"text"` (`types/data-table.ts:5,60`). No date, number, select, person, or URL column is expressible — a planning grid that cannot hold a date.

**D3 — No pagination, no virtualization.** `getDataTable` returns every row plus every cell in three unbounded queries (`controllers.ts:65–96`); the grid maps all rows (`data-table-grid.tsx:163–223`). `@tanstack/react-virtual` is already installed (`apps/web/package.json:50`) and unused here; the kanban work already virtualized columns for the same reason (`a381aadb6`).

**D4 — No sort, filter, search, or grouping.** Fixed sort by `position` (`data-table-grid.tsx:123–124`); headers are static divs, not buttons (`:147–156`); no filter state exists anywhere in the grid or route.

**D5 — No reordering.** The web fetcher never sends `position` (`data-table.ts:78–87` sends `name` only; rows have no update path at all). The API accepts `position` on create and `updateTextField` accepts it (`index.ts:150,175,212`) but there is no row-position endpoint (`index.ts:209–238` is POST/DELETE only) and no drag UI. Rows are stuck in creation order forever.

**D6 — Fragile cell editing.** Cells are uncontrolled `defaultValue` inputs remounted via `key={row.id}-${field.id}-${value}` (`data-table-grid.tsx:197–199`) — any refetch rebuilds the input and drops focus/caret. Commit is blur-only (`:203–217`): Enter doesn't commit, Tab doesn't advance, there is no cell-to-cell keyboard navigation. Failure handling resets the DOM value and toasts.

**D7 — O(table) work per edit.** `upsertCell` success invalidates the entire detail query (`use-data-tables.ts:91–94` → `refreshDetail`), re-fetching all rows + cells (`controllers.ts:65–96`) and remounting every edited input (D6). Two editors clobber each other by remount; there is no concurrency story.

**D8 — `window.confirm` for destructive actions**, twice in the grid (`data-table-grid.tsx:91–97`, `:90–97` delete-field; row delete `:175` uses none at all) and in the route (`$tableId.tsx:135–138`). The repo explicitly banned this pattern in #143 with a rationale comment (`backlog.tsx:59–61`) and ships an `AlertDialog` replacement there (`backlog.tsx:271–306`). Row delete has **no confirmation at all**.

**D9 — i18n violations.** Hardcoded aria-labels bypass `t()`: `Field ${field.name}` (`data-table-grid.tsx:61`), `Field options for ${field.name}` (`:79`), `Delete row ${rowIndex + 1}` (`:173`), `${field.name}, row ${rowIndex + 1}` (`:201`). Visible strings are clean (`i18n/en-US.json:1500–1543`) but a11y strings are not, so non-English screen-reader users get English.

**D10 — Mobile-hostile grid.** `min-w-max` horizontal scroll with fixed `w-52` columns (`data-table-grid.tsx:142`, `:56`, `:196`); only the `#` column is sticky (`:144`, `:168`). No column priority, no card fallback, and with D2 there are no narrow typed columns to prioritize anyway.

**D11 — Non-canonical URLs.** Sidebar and create-modal navigate with `organizationSlug: organization.id` (`nav-tables.tsx:99–103`, `create-data-table-modal.tsx:49–52`) although orgs have slugs (`schema.ts:182`) and the slug-routing migration (`cadc5921f`) made slugs canonical on every other route. Table URLs carry raw cuids; they "work" only because the org layout doesn't validate the param (`$organizationSlug.tsx:6–34`).

**D12 — Deletion is permanent, no trash.** `deleteDataTable` hard-deletes with cascade (`controllers.ts:116–127`; cascades at `schema.ts:866,893,914–917`). Contrast tickets: soft delete + restore + permanent-purge (`schema.ts:1080`; `task/index.ts:605–707`). One confirmed mis-click on a table = all rows/fields/cells gone forever.

**D13 — No table semantics.** The grid is divs and inputs, no `<table>`/`role="grid"`/`aria-rowcount` (`data-table-grid.tsx:140–263`); screen readers get only per-cell labels with row indexes that shift on delete.

**D14 — Position math races.** Position = `max+1` under concurrency with no uniqueness on `(tableId, position)` (`controllers.ts:136–141,197–202`; `schema.ts:877–880,901–905` are plain indexes). Two simultaneous creates can collide; nothing compact positions after deletes.

**D15 — Dead API surface.** `icon` is accepted on create/update (`index.ts:93,123`) and stored (`schema.ts:837`) but no client sends it. Either use it or remove it.

Severity: D1 is existential. D2–D7 make it unusable for real data. D8–D15 are quality debt.

---

## 3. Jobs-to-be-done for a ticket table

1. **Plan and triage at a glance** — scan many tickets' key fields (status, priority, assignee, due date) in one flat surface; change one field without opening each ticket. This is Linear's primary table use.
2. **Answer inventory questions** — "what's overdue and unassigned this sprint", "everything with the `infra` label sorted by due date". Needs sort + filter over real task fields, not free text cells.
3. **Bulk correction** — select 30 tickets, set priority / reassign / archive. `PATCH /bulk` already implements 10 operations (`task/index.ts:249–262`); list view and backlog already have selection UI.
4. **Hygiene audits** — find tickets missing assignee/due date/milestone; spot duplicate titles. Table + "empty bucket" grouping is the natural tool.
5. **Keyboard-first power use** — j/k to scan, x to select, Enter to open; already half-built in list view (`list-view/index.tsx:476–508`).

Explicitly **not** a JTBD observed anywhere in the product: free-form side data unrelated to tickets. If someone wants that, it is a separate product decision (see OQ2).

---

## 4. Prior art (knowledge-based; no API claims beyond what is public/common)

- **Linear** — Table is a first-class view type beside Board/List. All issue properties are columns; header click sorts (direction toggle); **group-by is separate from ordering**; a Display settings sheet controls column visibility; inline editing opens property-specific popovers (status/priority/assignee/labels/dates are pickers, not text inputs); j/k navigate, x select, Enter opens; drag to reorder; virtualized for thousands of issues; views persist their sort/group/filter; CSV export.
- **Jira (issue navigator / backlog list)** — column chooser over dozens of fields; single-column header sort; checkbox selection → bulk-change wizard; pagination with configurable page size; power filtering (JQL) for saved searches; inline edit only for supported fields; CSV/Excel export.
- **Height** — spreadsheet-styled table with typed custom attributes; Enter/Esc/Tab cell navigation; collapsible groups; keyboard-first editing.
- **Notion** — database with typed properties and multiple views (table among them); per-view sort/filter/group config; inline editors per property type; row opens the page (side peek). Cautionary tale: historically poor virtualization made large databases slow — virtualize from day one.

Convergent invariants: **columns = real typed properties of the entity**, per-view persisted config, property-specific inline editors, bulk edit, keyboard nav, virtualization, export. The current Kaneo table violates every one.

---

## 5. What the data model already serves

Survey of `taskTable` (`schema.ts:1021–1101`) and the list endpoint (`apps/api/src/task/controllers/get-tasks.ts`):

| Field | Schema | In `getTasks` payload | Per-field edit | Bulk op |
|---|---|---|---|---|
| Key (`number`, unique per board) | `:1034`, unique `:1099` | yes (`:159`) | — | — |
| Title | `:1043` | yes | `PUT /title/:id` (`task/index.ts:971–999`) | — |
| Status (+ columnId) | `:1056–1060` | yes | `PUT /status/:id` (`:735–763`) | `updateStatus` |
| Priority (default `low`) | `:1061` | yes | `PUT /priority/:id` (`:859–887`) | `updatePriority` |
| Assignee (user **and** team) | `:1035–1042` | name/image/team name (`:170–177`) | `PUT /assignee/:id` (`:888–936`) | `updateAssignee`, `updateTeam` |
| Labels | `labelTable :1343–1382` | yes (`get-tasks.ts:200–274`) | assign/unassign controllers | `addLabel`, `removeLabel` |
| Milestone | `milestoneTable :990–1019` | `milestoneName` (`:173`) | assign-milestone controller | **no bulk op** (gap A4) |
| Start / due date | `:1085–1086` | yes (`:163–164`) | due: `PUT /due-date/:id` (`:937–969`); **start: none** (gap A4) | `updateDueDate` only |
| Archive (orthogonal to status) | `:1075–1079` | `archivedAt` (`:169`) | `PUT /archived/:id` (`:827–858`) | `archive`, `unarchive` |
| Subtask parent | `taskRelationTable :1743–1768`, depth 1–4 (`:517–519`) | `parentTask` (`get-tasks.ts:346–391`) | relation controllers | — |
| Position | `:1033` | yes | reorder endpoint (`task/index.ts:180–222`) | — |
| Created / updated | `:1087–1091` | yes (`:166–167`) | — | — |
| Time tracked | `timeEntryTable :1215–1245` (`duration`) | no | — | — |
| **Estimate / points** | **does not exist** (schema-wide grep) | no | — | — |

Listing capability (`task/index.ts:129–179` + `get-tasks.ts`): board-scoped; filters `status`, `priority`, `assigneeId`, `dueBefore`, `dueAfter`; sorts `createdAt`, `priority` (CASE-weighted, `get-tasks.ts:61–67`), `dueDate`, `position`, `title`, `number`; pagination ≤100/page (`:138–142`); archived tickets quarantined out of columns (`:393–418`).

### API gaps (API-work items, not design fiction)

- **A1** No cross-board/org ticket listing. Only `/my-tasks` (relation-scoped, `task/index.ts:84–128`) and per-board `/tasks/:boardId`. An **org-level** table needs a new endpoint; a **board-level** table needs nothing.
- **A2** List filters missing: label, milestone, team assignee, `has assignee/has due date`, text search (`task/index.ts:145–168`).
- **A3** No `startDate`/`updatedAt` sortBy (`get-tasks.ts:43–50`).
- **A4** Bulk ops missing `updateStartDate`, `updateMilestone`, `setParent`; no dedicated `PUT /start-date/:id` (full `PUT /:id` requires boardId+position — wrong shape for a cell edit, `task/index.ts:471–535`).
- **A5** Export is per-board JSON only (`task/index.ts:536–560`); no CSV, no org scope.
- **A6** (only if estimates are wanted) new column + validation + endpoints — schema migration.

---

## 6. Proposed UX spec

**Placement.** A **view mode of tickets on a board**, not a standalone entity: `board/$boardSlug/table` alongside board/list/backlog/gantt/calendar (view-mode switcher and shortcuts already exist, `backlog.tsx:84–119`). Org-level "all tickets" table only after A1. The standalone `table/$tableId` route is not this feature.

**Columns.**
- Default: Key (`boardSlug-number`, monospace), Title, Status (column icon, per list-view precedent), Priority (flag icon), Assignee (avatar), Labels, Due date.
- Optional toggles: Start date, Milestone, Parent, Created, Updated, Links count (payload already carries repoLinks/externalLinks).
- Not offered without API work: Estimate (A6), Time tracked (needs SUM endpoint).

**Grouping.** Reuse `buildListGroups` + `BOARD_GROUP_BY_VALUES` = `none|status|assignee|priority|label|dueDate|milestone` (`list-grouping.ts:9–18`, `use-task-filters-with-labels-support.ts:42–50`). Contract already established: list and board share one vocabulary so switching views preserves grouping — the table joins it, invents nothing.

**Sorting.** Single-column, header click, direction arrow (`aria-sort`). Client-side first: reuse `sortTasks`/`SortConfig` (`backlog.tsx:65–68,134–141`), server-side `sortBy` once paging is server-driven.

**Filtering.** Reuse `BoardToolbar`'s existing filter set (assignee, priority, labels, dates) exactly as backlog does (`backlog.tsx:212–230`). Zero new API for v1 (client-side over the fetched board).

**Inline editing scope (v1).** Status, priority, assignee, due date via the existing property popovers/quick-select pattern; title via inline text with Enter-commit/Esc-cancel. Everything else read-only; Enter/click opens `TaskDetailsSheet` (same sheet backlog uses, `backlog.tsx:258–263`). Labels/date-range editing wait for Phase 2; description never inline.

**Bulk.** Reuse `useBulkSelectionStore` + `BulkToolbar` (as list view does, `list-view/index.tsx:383–385,847`) over `PATCH /bulk` operations that exist today.

**Density.** Compact (36px) / comfortable (44px) toggle, persisted via `useUserPreferencesStore` (exists). Virtualize rows with installed `@tanstack/react-virtual`.

**Keyboard.** j/k focus, x toggle select, shift+j/k extend, Enter open sheet, Esc close/cancel, c = create (existing create modal). Register via `useRegisterShortcuts` (list-view precedent `:476–508`); document in the keyboard-shortcuts modal (`i18n/en-US.json:1544+`).

**Empty / loading.** Skeleton rows while fetching (backlog skeleton precedent `backlog.tsx:245–254`); empty board → "create first ticket" CTA; zero filter matches → "Clear filters" action; archived tickets live only in backlog, as everywhere else (#226).

**Mobile fallback.** Below `md`, render the existing `TaskRow` card list instead of the grid — no horizontal-scroll spreadsheet on a phone (anti-D10).

**A11y & i18n.** Semantic `<table>` or `role="grid"` with `aria-rowcount`/`aria-sort`; every string through `t()` including aria-labels (anti-D9); destructive actions through `AlertDialog`, never `window.confirm` (anti-D8); no permanent deletes of tickets (trash path already exists).

**Permissions.** Read = board view (`organizationAccess.fromBoard` already guards the endpoint); inline edit/bulk gated client-side by `useOrganizationPermission` task:update, enforced server-side as today.

---

## 7. Phased plan

**Phase 0 — decisions (owner).** OQ1–OQ3 below. No code.

**Phase 1 — smallest viable slice (no API work).** Board-scoped ticket table:
`TableView` component (semantic table, 7 default columns, group-by reuse, header-click client sort, BoardToolbar filters, TaskDetailsSheet, j/k/x/Enter, skeleton/empty states, virtualization). Wire as a view mode beside list. Roughly one new component + route wiring; everything else is imported from list-view/backlog stock.

**Phase 2 — editing & bulk.** Property-popover inline editors (status/priority/assignee/due date/title) on existing per-field PUTs; optimistic update with rollback (list-view archive is the pattern, `list-view/index.tsx:692–715`); selection + BulkToolbar; archive confirm modal reuse.

**Phase 3 — configuration & polish.** Persist per-board column set/density/group/sort (localStorage per `readListGroupBy` precedent, `list-grouping.ts`); mobile card fallback; column show/hide; i18n + a11y sweep.

**Phase 4 — API work (only when actually needed).** A1 org-level table, A2 server-side label/milestone/search filters, A3 startDate sort, A4 startDate/milestone bulk+per-field endpoints, A5 CSV export. Each is a separate small ticket; none blocks Phases 1–3.

**Phase 5 — retire the standalone Tables.** If OQ2 says kill: export any real user data, drop the four `data_table*` tables, delete 3 API files + 7 web files, remove the org flag. Do **not** start here.

---

## 8. Open questions for the owner

1. **Scope:** is "Table" a per-board view of tickets (assumed default, zero API work) or an org-wide cross-board grid (needs A1)? Both eventually?
2. **Standalone Tables fate:** keep the free-form spreadsheet behind the alpha flag, or delete it once ticket-table ships? Its data model cannot become a ticket table (D1/D2) — "fixing" it in place is not on the menu.
3. **Custom fields:** does the product ever want user-defined ticket columns (Jira/Notion/Height style)? That is a real schema project (custom-field tables) and would change the column architecture — worth deciding before Phase 3 hardens the column set.
4. **Estimates:** Linear/Jira show points; Kaneo has time entries but no estimate field anywhere. Add it (A6) or leave estimates out of the table?
5. **Saved views:** per-user private config only, or shareable team views (the resource-grant lattice could grade them like tables/boards)?
6. **Mobile:** is the card fallback acceptable, or must the actual grid be usable on phones?
7. **Concurrency:** is live multi-user editing a requirement (websocket/sync work), or is invalidate-refetch acceptable?
8. **Scale:** are boards expected past a few hundred tickets (server paging from day one, A2) or is client-side-all fine (current boards ~180 tasks max per code comments, `list-view/index.tsx:334–337`)?

---

## 9. PIVOT (owner decision): NocoDB-style typed tables + Grafana-style dashboards

Owner direction supersedes the ticket-table-only recommendation in §6/§7: the Tables feature becomes **user-defined tables with typed fields** (NocoDB-like) plus **custom visualizations over them** (Grafana-like). The ticket table view remains a separate, unaffected track.

### 9.1 How NocoDB actually does it (knowledge-based)

NocoDB materializes each user table as a **real SQL table** in the underlying database (dynamic DDL per table/column, real typed columns and indexes) and keeps its own `nc_*` metadata tables describing bases/tables/fields/views. The power: native SQL, joins, direct external access. The costs: **runtime DDL** — migrations and rollbacks become app operations; multi-tenant DDL is risky; backups couple to dynamic objects; schema-managed ORMs (drizzle owns Kaneo's `schema.ts`, migrations are code) conflict with tables the ORM can't know about.

### 9.2 DECIDED: dedicated schema `kaneo_tables` in the same Postgres (owner decision)

Owner call: **same-Postgres schema + controlled runtime DDL** (NocoDB-style real columns). Typed EAV (previous revision of this section) rejected — aggregation/wide-table cost doesn't scale. Separate database rejected for now (second pool, no cross-DB transactions, deploy/test/backup pain) — revisit in the Stellarc rewrite.

**Layout**

- Static metadata stays in `public`, drizzle-managed like every other table: `data_table` (gains `physicalName`), `data_table_field` (type enum + `options jsonb`), new `data_table_dashboard`, new `data_table_ddl_log` (DDL ledger).
- Dynamic row storage lives in schema **`kaneo_tables`**: one physical table per logical table, named `kaneo_tables."t_<dataTableId>"` (cuid-derived ⇒ under PG's 63-char cap; UI renames touch metadata only — NocoDB's `table_name` vs `title` trick).
- drizzle-kit diffs `public` only, so runtime DDL in `kaneo_tables` never shows up as schema drift. Same pool, same transactions — and **Postgres DDL is transactional**: `CREATE TABLE` + metadata insert commit atomically (the main win over a separate database).

**Physical table shape**

```sql
CREATE TABLE kaneo_tables."t_<dataTableId>" (
  id           text PRIMARY KEY,               -- cuid
  position     double precision NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  c_<fieldId>  numeric                         -- one column per field, type by registry:
  --   text / longtext / url / email / select / user  → text   (select+user store ids)
  --   number / percent / currency                    → numeric
  --   date → date          datetime → timestamptz    checkbox → boolean
  --   multiselect / json / link(v1)                  → jsonb   (link = array of target row ids)
);
CREATE INDEX ON kaneo_tables."t_<dataTableId>" (c_<fieldId>);  -- only select/user/date fields: filters, grouping, time series
```

No cross-column constraints needed (one column per field). `required` is app-level validation via `options` — DDL stays minimal.

**DDL engine** — one module, `apps/api/src/data-table/store/`:

- `bootstrap()` — `CREATE SCHEMA IF NOT EXISTS kaneo_tables` (runs at API boot + in test env setup).
- `createTable / addField / changeType / dropField / dropTable` — DDL generated from metadata; identifiers always server-generated (`t_`/`c_` + cuid), user input never reaches an identifier; every statement logged to `data_table_ddl_log`.
- `reconcile()` — diff physical columns vs metadata, run at boot and in tests; the self-heal net.
- Type change = `ALTER COLUMN … TYPE … USING` cast (full table rewrite under ACCESS EXCLUSIVE — acceptable at this scale; `ponytail:` upgrade path = shadow-copy-and-swap when tables get big).
- Delete: logical soft-delete (`data_table.deletedAt`) keeps the physical table; explicit purge drops it (restores the trash semantics the old feature lacked, cf. D12).
- `user`-field ids carry no FK to `public."user"` — validated against org members at write time; keeps the feature's DDL decoupled from core auth tables.

**Query/aggregation** (§9.3's endpoint, unchanged shape): the spec→SQL builder maps `fieldId → c_<fieldId>` on the physical table — `count(*)`, `avg/sum(c_numeric)`, `date_trunc(bucket, c_date)`, `GROUP BY c_select` with labels resolved from `data_table_field.options`. Link fields v1: jsonb array of target row ids matched with `= ANY(...)`; real join tables land in P4.

**EAV retirement:** `data_table_row` + `data_table_cell` drop in the P1 migration. Feature is flag-gated alpha; if any rows exist, a script migrates them into the new physical tables (expected ≈ 0).

### 9.3 Query engine (the Grafana part)

One whitelisted aggregation endpoint — clients never send SQL:

```
POST /data-table/organization/:orgId/table/:tableId/query
{ metric: { agg: 'count'|'sum'|'avg'|'min'|'max', fieldId? },
  groupBy?: { fieldId, bucket?: 'day'|'week'|'month' },
  filters?: [{ fieldId, op: 'eq'|'neq'|'in'|'lt'|'lte'|'gt'|'gte'|'isEmpty', value }],
  limit? }
```

→ SQL against the physical table: `count(*)`, `sum/avg/min/max(c_<numericField>)`, `date_trunc(bucket, c_<dateField>)`, `GROUP BY c_<field>` with labels resolved from field `options`. Runs under the existing `tablePrivilege('view')` middleware (`data-table/index.ts:40–57`).

### 9.4 Dashboards

```ts
data_table_dashboard { id, organizationId, name,
  panels: jsonb  // [{ id, title, type: 'stat'|'bar'|'line'|'area'|'pie'|'table',
                 //    span: 8|9|12|15|24,          // 24-col grid, explicit %
                 //    query: <9.3 spec, tableId inside> }]
  createdAt, updatedAt }
```

Panels as jsonb (config-only, coarse-grained edits; split to rows only if sharing/permissions per panel ever materialize). Sidebar gains a **Dashboards** section (see mock). Panel rendering = fetch `/query` per panel + typed renderer; stat/bar/line/pie/table covers the 80% (mock shows all five).

### 9.5 Revised phasing

- **P1 — foundation:** schema bootstrap + DDL engine (`createTable/addField/changeType/dropField/dropTable` + `reconcile` + `data_table_ddl_log`); migration drops the EAV pair (`data_table_row`/`data_table_cell`) and migrates-or-discards alpha rows; field-type UI (menu per mock); typed cell editors/renderers (select chips, number/percent/currency right-aligned, date picker, checkbox, user picker, url/email validation at trust boundary); virtualized grid + optimistic cell updates (fixes D3/D6/D7).
- **P2 — query engine:** §9.3 endpoint (spec → physical-SQL builder) + integration tests.
- **P3 — dashboards UI:** §9.4 tables/API + panel grid + the five panel types.
- **P4 — link-to-table, lookup fields, CSV import/export.**
- **P5 — formulas, attachments.** Ticket-table view (§7 Ph1–3) runs as its own track.

### 9.6 Open questions (updated)

- CSV/Excel import parity with NocoDB? (affects P4 priority)
- Row-level ACL needed, or table-level (existing privilege lattice) enough?
- Per-org limits: max tables/fields/rows/dashboards (multi-tenant safety for the dynamic tables)?
- `user` fields: single user only, or teams too (schema already supports team assignee on tickets)?
- Attachments in v1 via `assetTable`, or P5?

### 9.7 Decision log

- **Storage = schema `kaneo_tables` inside the same Postgres.** Metadata in `public` (drizzle-managed); row tables dynamic via the DDL engine. Owner decision, supersedes the typed-EAV proposal of the first §9.2 revision.
- **Typed EAV rejected:** per-cell joins + per-row casts make wide-table aggregation degrade with table width; real columns aggregate natively.
- **Separate database deferred** to the Stellarc rewrite (second pool, cross-DB transaction loss, deploy/test/backup overhead not worth it at one deployment).
- **Integration gate note:** fresh-Postgres test envs bootstrap the schema via `store/bootstrap()` + `reconcile()` — no docker-compose change beyond the one it already creates.
