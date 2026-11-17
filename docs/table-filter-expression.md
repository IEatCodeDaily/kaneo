# Table filter expression (KFL-406)

`TableRowQuery.filters` is a single JSON document. Saved views must preserve it unchanged:

```json
{
  "conjunction": "and",
  "children": [
    { "conjunction": "or", "children": [
      { "fieldId": "status-field", "op": "eq", "value": "open-choice" },
      { "fieldId": "status-field", "op": "eq", "value": "review-choice" }
    ] },
    { "fieldId": "amount-field", "op": "gt", "value": 100 }
  ]
}
```

The shared contract and type/operator registry live in `apps/api/src/data-table/filter-expression.ts`. Optional `id` values are UI identities only. The root group counts as level 1; maximum group depth is 3, maximum conditions 50, maximum nodes 100 (including empty groups). Lists have at most 50 values and strings at most 1,000 characters. The empty root matches all rows. Empty builder groups and unfinished conditions are omitted from the submitted query without flattening group logic.

Legacy flat arrays (`contains`, `min/max`, `from/to`, `choiceId`, `checked`) are still accepted and converted into one AND group. New clients write the expression document. No database migration is required.

## Values and operators

- Text/long text/URL/email/JSON: `eq`, `neq`, `contains`, `notContains`, `isEmpty`, `isNotEmpty`.
- Number/percent/currency: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `isEmpty`, `isNotEmpty`; values are finite JSON numbers.
- Date/datetime: `eq`, `lt`, `gt`, `lte`, `gte`, `pastDays`, `nextDays`, `isEmpty`, `isNotEmpty`.
- Select: `eq`, `neq`, `in`, `notIn`, `isEmpty`.
- Multiselect/Ticket: `hasAny`, `hasAll`, `hasNone`, `isEmpty`.
- User: `eq`, `neq`, `in`, `isMe`, `isEmpty`. `isMe` uses the authenticated user, including CSV export.
- Checkbox: `isChecked`, `isNotChecked` (true and false respectively; NULL is neither).
- Link: `hasAny`, `isEmpty`; only live targets in an accessible table participate.
- System fields use the same operators as their underlying number/datetime/user type.

Choice/member/Ticket/link values are stored identifiers, selected using readable labels; the builder never displays raw identifiers. List operators require a nonempty string array. Invalid/deleted/foreign fields, unavailable link targets, unknown references, and type-incompatible operators return 400. The table endpoint's existing organization/resource authorization remains in force.

Scalar empty means SQL NULL only: `""`, `0`, and `false` remain distinct stored values. Collection empty means NULL or an empty array. Negative operators (`neq`, `notContains`, `notIn`, `hasNone`, `isNotChecked`) also match empty cells, as in NocoDB: "Status is not Closed" includes rows with no status. Text contains is case-insensitive and literal, not a SQL wildcard pattern; equality is exact.

Calendar dates use UTC. Datetime values accept an ISO timestamp; timestamps without an offset (the native datetime-local editor) are interpreted as UTC. A date-only datetime comparison uses the entire UTC day: `eq` matches [midnight, next midnight), `gt` starts at next midnight, `lte` ends before next midnight. Relative N-day windows include today: past = [today − N days, tomorrow), next = [today, today + N + 1 days); N is an integer from 0 to 36,500. PostgreSQL's transaction date fixes the boundary for the entire request.

`row-query.ts` compiles the predicate with bound parameters and uses its existing single materialized statement for the page, matching count, group counts, summaries, and row-export. The browser never evaluates the new expression against loaded rows.

## Verification

- `tests/api-integration/table-filter-groups.test.ts`: 1,005 seeded rows, nested expression and paging/export consistency, UTC and scalar boundaries, legacy arrays, limits, invalid/deleted/foreign fields and inaccessible links.
- `filter-builder.test.tsx`: add/remove/clear and recursive draft pruning/counting without flattening OR.
- Render state `table-filter-groups`: desktop dark and 390px phone dark; AND/OR, nesting, removal, clear, depth limit, active count, request shape, and control containment.
