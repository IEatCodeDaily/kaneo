# Kaneo Tables Product Architecture

**Status:** Proposed architecture for KFL-144

**Goal:** Turn the existing Alpha text grid into a project-native structured-record system without turning Kaneo into a generic low-code platform.

**Product boundary:** Tables are standalone organization resources, separate from Boards and ticket IDs, but they can reference Kaneo-native resources such as tasks, boards, repos, milestones, members, and teams.

---

## 1. Decision summary

Kaneo Tables should borrow:

- Airtable/NocoDB's typed fields, saved views, relation picker, and record drawer.
- Baserow's clean separation between data and view configuration.
- SeaTable's principle that permission-scoped views may narrow access but never broaden it.
- NocoBase's unified semantic record model consumed by API, permissions, views, and automations.

Kaneo Tables should explicitly reject:

- Free-form page/widget builders.
- User-authored JavaScript, SQL, or arbitrary formulas in the first releases.
- Datasource connectors and cross-database joins.
- Generic plugin installation.
- Retool/Appsmith-style per-screen query logic.
- A general visual workflow programming environment.

A proposed feature is out of scope when it primarily helps users build software rather than manage project data.

---

## 2. Current implementation: keep versus replace

### Keep

- Standalone organization ownership.
- Alpha organization feature flag.
- `view` / `edit` / `manage` resource privilege lattice.
- Stable opaque table, field, row, and cell IDs.
- Sparse cell storage concept.
- Existing sidebar discovery, creation modal, route, and table resource grants.
- Existing table/field/row/cell data as migration input.

### Replace before leaving Alpha

- Text-only field constraint.
- String-only cell values.
- Full-table detail endpoint that returns every row and cell.
- Full-query invalidation after each blurred cell.
- Hand-built flexbox grid.
- Board-role permission helpers in table UI.
- Race-prone `max(position) + 1` ordering.
- Uncontrolled cell inputs and blur-only editing.
- Blocking `window.confirm` deletion flows.

### Current correctness bugs to fix first

- UI capability checks disagree with API resource privileges.
- Cells can theoretically combine a row and field from different tables if writes bypass the controller.
- Cell type exposes an optional ID although the database has no cell ID.
- Feature-disabled direct routes render a generic load error instead of being unavailable.
- Backend-supported icons, nullable values, and positions are not represented consistently in the web client.

---

## 3. Core product model

### Table

A table is a schema and record container owned by an organization.

It has:

- Name and icon.
- Primary/display field.
- Resource privilege baseline and explicit grants.
- Schema revision.
- Created/updated metadata.
- Alpha/archived state as needed later.

Tables do not have ticket numbers and are not board variants.

### Record

A record is the stable collaboration object represented by one grid row.

It has:

- Stable opaque ID.
- Table ID.
- Fractional rank/order for manual-order views.
- Created/updated timestamps and actors.
- Revision number for optimistic concurrency.
- Optional archived/deleted state later.

A record must open in a right-side drawer that preserves grid context. The drawer becomes the home for fields, long text, attachments, relations, comments, and activity history.

### Field

A field defines validation, rendering, filtering, sorting, and serialization.

Initial field types:

1. `text`
2. `long_text`
3. `number`
4. `boolean`
5. `date`
6. `datetime`
7. `single_select`
8. `multi_select`
9. `url`
10. `member`
11. `task`
12. `attachment`

Second-wave field types:

- `board`, `repo`, `milestone`, and `team` references.
- Controlled `record_link` after relation semantics are proven.
- Formula, lookup, count, and rollup as separate read-only kinds.

Every field stores stable configuration in JSONB but its type remains a controlled server-owned enum. Display names never become identifiers.

### View

A view is a first-class saved query and presentation object—not copied records.

A view owns:

- Type: initially `grid` only.
- Ownership mode: collaborative, personal, or locked.
- Filter AST.
- Ordered sorts.
- Optional one-level grouping.
- Search state only when explicitly saved.
- Field order, visibility, width, frozen state.
- Row density and manual-order mode.

Later view renderers—form, Kanban, calendar, timeline—must reuse this contract rather than invent independent query formats.

---

## 4. Storage architecture

### Decision: typed sparse values, not string EAV and not opaque record JSON

Use a typed sparse value table with one logical value per `(table_id, record_id, field_id)`.

Proposed tables:

- `data_table`
- `data_table_field`
- `data_table_record` (rename/migrate current row concept)
- `data_table_value`
- `data_table_view`
- `data_table_view_field`
- `data_table_relation`
- `data_table_activity`
- Later: `data_table_automation`, `data_table_automation_run`, `event_outbox`

`data_table_value` should contain:

- `table_id`
- `record_id`
- `field_id`
- `text_value`
- `number_value`
- `boolean_value`
- `date_value`
- `timestamp_value`
- `json_value` for controlled list/configured values
- `updated_at`, `updated_by`

Constraints:

- Composite primary key `(record_id, field_id)`.
- Composite foreign keys include `table_id`, proving record and field belong to the same table.
- Check constraint allows exactly one typed value column, or all null for an explicit blank only if that state is required.
- Per-type indexes begin with `(table_id, field_id, typed_value)`.
- Field type and value compatibility is validated in the service transaction.

Why this model:

- Typed filters and sorts remain indexable.
- Sparse records stay cheap.
- Field names can change safely.
- API values remain typed.
- Multiple filters compile to indexed `EXISTS` clauses without dynamic physical columns.
- It avoids unbounded JSON casts and avoids generating a PostgreSQL table per user table.

Why not one JSONB `values` object per record:

- Easy writes, ugly indexing.
- Type changes and validation become hidden application behavior.
- Arbitrary dynamic field indexes become operationally awkward.
- Multi-field filtering and sorting require repeated JSON extraction/casts.

Why not physical PostgreSQL columns per user field:

- Every UI schema edit becomes DDL.
- Migrations, locks, type conversion, rollback, and identifier mapping become product-critical complexity.
- It turns a project feature into a database administration product.

### Ordering

Replace integer append positions with a rank string/decimal fractional ordering scheme. Rebalancing must be transactional and rare. Saved sorted views ignore manual rank; manual-order grid views use it.

### Schema revisions

Each schema-changing mutation increments `data_table.schema_revision`. Clients include the revision when changing fields/views. Conflicts return `409` with machine-readable current state.

### Record revisions

Each record mutation increments `record.revision`. Bulk writes accept expected revisions and return per-record conflict results.

---

## 5. Query and API contract

### Split schema from record queries

Do not return the entire table through one endpoint.

Proposed endpoints:

- `GET /tables/:tableId/schema`
- `GET /tables/:tableId/views`
- `GET /tables/:tableId/views/:viewId/records`
- `POST /tables/:tableId/records/query`
- `POST /tables/:tableId/records`
- `PATCH /tables/:tableId/records/:recordId`
- `POST /tables/:tableId/records/bulk`
- `DELETE /tables/:tableId/records/:recordId`
- Schema endpoints for fields and views.
- Import/export job endpoints later.

### Canonical query AST

One structured filter AST must be reused by:

- Grid filtering.
- Saved views.
- REST queries.
- Exports.
- Relation candidate pickers.
- Automation conditions.
- Future restricted row scopes.

Example:

```json
{
  "op": "and",
  "conditions": [
    { "fieldId": "fld_status", "operator": "is", "value": "blocked" },
    {
      "op": "or",
      "conditions": [
        { "fieldId": "fld_due", "operator": "before", "value": "2026-09-01" },
        { "fieldId": "fld_due", "operator": "is_empty" }
      ]
    }
  ]
}
```

The server validates operator compatibility by field type. No raw SQL and no Airtable-style formula string as the primary API.

### Record query response

- Cursor pagination, never offset as the main contract.
- Requested field projection.
- Stable row IDs and typed values.
- Total count optional because it can be expensive.
- Sort values encoded in the cursor.
- Optional `viewId`, plus request-time filters that may only narrow the view.
- Effective capabilities returned with schema/view metadata.

### Bulk mutations

Cell-by-cell network writes are forbidden as the long-term API.

The grid queues changes and sends a transaction batch:

```json
{
  "changes": [
    {
      "recordId": "rec_1",
      "expectedRevision": 7,
      "values": {
        "fld_status": "blocked",
        "fld_due": "2026-09-01"
      }
    }
  ]
}
```

The response contains accepted revisions, validation errors, and conflicts per record. This enables paste/fill operations and resilient optimistic UI.

---

## 6. Grid architecture

The current flex grid must not be extended.

Use a virtualized grid based on TanStack Table plus TanStack Virtual, with a dedicated grid-state layer. Do not adopt AG Grid unless we explicitly accept its bundle, styling, and licensing constraints.

Required before Beta:

- Row virtualization and column virtualization when needed.
- Fixed viewport ownership; no document-level horizontal scroll.
- Sticky/frozen first column and header.
- Keyboard navigation with arrow, Tab, Enter, Escape.
- Cell/range selection.
- Copy/paste TSV.
- Column resize and reorder.
- Optimistic draft state independent from server query cache.
- Batched save queue and visible error/conflict state.
- Accessible grid semantics.
- Server-paged loading as the viewport moves.

The record drawer must not shift grid layout. It overlays/portals like Kaneo's task detail drawer and supports next/previous record navigation.

---

## 7. Permissions

Keep the existing resource-level lattice but expose it to the client accurately.

Initial capabilities:

- `view`: schema and authorized records.
- `edit`: create/edit/delete records and values.
- `manage`: schema, views, table settings, grants, imports/exports.
- Later separate `automate` only if needed.

Rules:

- Every API route enforces permission server-side.
- UI receives effective privilege and gates controls accordingly.
- Hidden columns and view filters are presentation, not security.
- If restricted views arrive later, their server-enforced row/field scope is a maximum baseline; users may narrow but never broaden it.
- Table exports require an explicit server capability check.

First fix: replace `canCreateBoards()` and `canUpdateBoards()` table UI checks with table-specific effective privilege.

---

## 8. Relations and Kaneo integration

Relations are where Kaneo should beat generic spreadsheet products.

### First native reference fields

- Task reference.
- Member reference.
- Board reference.
- Repository reference.
- Milestone reference.
- Team reference.

These store stable IDs and display current labels. Candidate pickers obey organization scope and target-resource permissions.

A task reference can expose task key, title, status, assignee, and due date in the record drawer without copying those values into table cells.

### Generic record links

Delay table-to-table record links until native references and authorization are solid. When added:

- Use explicit relation rows, never delimited IDs in a cell.
- Support single/multiple cardinality.
- Persist stable record IDs.
- Define reciprocal display but avoid automatically exposing database cardinality jargon.
- Candidate pickers can be constrained by a saved view.

### Computed fields

Order of implementation:

1. Deterministic row formula.
2. Lookup through an explicit relation.
3. Count.
4. Rollup.

Use a typed parser/evaluator, dependency graph, cycle detection, execution budget, and visible error values. Never use unrestricted `eval`.

---

## 9. Import and export

### Import

Staged flow:

1. Upload CSV.
2. Preview rows.
3. Infer candidate types.
4. Map columns to existing/new fields.
5. Validate typed values.
6. Choose append or upsert with an explicit key.
7. Execute as a tracked job.
8. Return per-row errors and an import receipt.
9. Allow rollback/batch deletion using the receipt where practical.

Never silently coerce the whole file to text.

### Export

CSV first.

Default exports the current view:

- Current filters.
- Sort order.
- Visible fields and field order.

Offer an explicit whole-table export. Stable internal IDs are opt-in.

---

## 10. Automation boundary

Do not build a visual workflow engine during the table foundation.

First create a transactional outbox for record/schema events:

- Record created, updated, deleted.
- Field/schema changed.
- Import completed.

Later provide small declarative rules:

Triggers:

- Record created/updated.
- Date reached.
- Manual action.

Conditions:

- Typed field comparisons.
- Member/team membership.

Actions:

- Update record.
- Create/link Kaneo task.
- Notify member/team.
- Send webhook.

Every run needs actor, causation ID, retry state, error history, and recursion guards. No loops, arbitrary JS, SQL, user-managed credentials, or nested workflow graphs initially.

---

## 11. Phased delivery

### Phase 0 — Correct the Alpha foundation

- Align UI with effective table privileges.
- Enforce row/field/table consistency in storage.
- Introduce schema and record revisions.
- Replace race-prone integer ordering.
- Add real HTTP integration tests and direct-route feature-flag behavior.
- Keep current UI hidden behind Alpha.

### Phase 1 — Typed records and query API

- Migrate rows/cells to typed record/value storage.
- Initial field types: text, long text, number, boolean, date/datetime, selects, URL.
- Schema endpoint and cursor-paginated record query.
- Canonical filter AST and ordered sorts.
- Bulk record mutations with validation/conflicts.
- Migration preserves current tables and text cells.

No new public UI until this phase is proven.

### Phase 2 — Production grid

- Virtualized grid.
- Keyboard navigation, selection, copy/paste.
- Column resize/reorder/freeze.
- Optimistic draft queue and batched saves.
- Server paging and projection.
- Exact viewport E2E at desktop and narrow widths.

### Phase 3 — Saved views and record drawer

- Collaborative/personal/locked grid views.
- Filters, ordered sorts, one-level grouping.
- Field visibility/order/width/density.
- Record drawer with comments/activity and next/previous navigation.

### Phase 4 — Kaneo-native references

- Member, task, board, repo, milestone, and team fields.
- Permission-aware candidate pickers.
- Task creation/linking from record drawer.

### Phase 5 — Import/export and forms

- View-aware CSV export.
- Staged CSV import with receipts.
- Form view for record creation/editing.

### Phase 6 — Computed fields and controlled relations

- Generic record links.
- Formulas, lookup, count, rollup.
- Dependency graph and cycle/error UX.

### Phase 7 — Declarative automations

- Outbox-backed triggers and narrow actions.
- Run history, retry, attribution, loop prevention.

---

## 12. Proposed KFL epic structure

Keep KFL-144 as the epic. Create child tickets only after the architecture decision is accepted:

1. Table privilege parity and Alpha route containment.
2. Typed table schema and migration.
3. Canonical filter/sort AST and SQL compiler.
4. Cursor-paginated record query API.
5. Transactional bulk record mutation API.
6. Virtualized grid foundation.
7. Grid keyboard selection and copy/paste.
8. Grid draft/save/conflict state.
9. Saved grid views.
10. Record detail drawer with activity/comments.
11. Kaneo-native reference fields.
12. CSV import/export jobs.
13. Formula and relation foundation.
14. Event outbox and declarative automation rules.

Every child ticket must include RED/GREEN tests and live proof. No placeholder UI may be exposed before its persistence and API contract exist.

---

## 13. Acceptance gates before Tables leaves Alpha

- 100,000-record synthetic table remains usable through server paging and virtualization.
- 50-column table does not break viewport or document layout.
- Paste at least 1,000 cells through one batched mutation flow.
- No full-table refetch after a single cell edit.
- Keyboard-only edit/navigation path works.
- Permission matrix proves view/edit/manage parity between API and UI.
- Cross-table row/field value writes are impossible at the database boundary.
- Concurrent edits produce explicit conflicts, not silent last-write-wins loss.
- Direct route is unavailable when feature flag is off.
- Production artifact E2E covers create, type, filter, sort, edit, reload, and permission denial.
- Existing Alpha text tables migrate without data loss.

---

## 14. Open decision requiring owner approval

Approve or reject this foundation:

> **Typed sparse value storage with a canonical server-side query AST, virtualized grid, and saved views; Tables remain project-native and explicitly not a generic low-code platform.**

Once approved, Phase 0 and Phase 1 can be decomposed into executable KFL child tickets and a migration plan.