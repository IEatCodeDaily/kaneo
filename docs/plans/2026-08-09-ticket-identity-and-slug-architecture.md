# Ticket Identity and Slug Architecture

**Status:** Proposed architecture for KFL-270 and the KFL-119 terminology migration

**Goal:** Make organization, board, and ticket URLs human-readable while preserving every historical identifier and all UUID deep links.

---

## 1. Identity model

### Internal ID

Every organization, board, and ticket keeps its opaque immutable database ID. Internal IDs remain the final persistence identity and integration fallback.

### Organization slug

Human-readable URL namespace, e.g. `nevrlabs`.

- Case-insensitive normalized slug.
- Globally unique across current slugs and historical aliases.
- Mutable only through an explicit rename operation.
- Old slugs remain permanent aliases.

### Board key

Short human-readable ticket prefix, e.g. `KFL`, `PLATFORM`, or `OPS`.

- Stored normalized uppercase for display and lowercase/case-insensitive comparison.
- Unique within an organization across current keys and historical aliases.
- Not derived automatically after board creation.
- Board-name changes do not change the key.
- Explicit key rename is allowed, but every prior key remains a permanent alias.
- Existing tickets receive a new canonical display key after rename but keep all previous keys resolvable through the board-key alias.

The current `board.slug` should migrate to `board.key`. Do not keep calling the ticket prefix a generic slug in new code.

### Ticket number

Board-local positive integer.

- Allocated transactionally by the existing board counter.
- Unique within the board.
- Never changes.
- Never reused, including after deletion.

### Ticket key

Derived display identity:

`<BOARD_KEY>-<TICKET_NUMBER>`

Examples:

- `KFL-144`
- `PLATFORM-1`
- `OPS-982`

A ticket key is not stored as the ticket's primary identity. It is resolved from board key/aliases plus immutable ticket number.

---

## 2. Alias semantics

Aliases are permanent identity history, not redirects stored in application code.

Proposed tables:

```text
organization_slug_alias
- id
- organization_id
- slug_normalized
- created_at
- retired_at nullable (administrative metadata only; resolution remains valid)

board_key_alias
- id
- organization_id
- board_id
- key_normalized
- created_at
- retired_at nullable
```

Constraints:

- Unique normalized organization namespace across current organization slugs and aliases.
- Unique `(organization_id, key_normalized)` across current board keys and aliases.
- Alias may point to exactly one resource forever.
- A historical alias can never be claimed by another resource.
- Current slug/key must not duplicate one of its own aliases.
- Normalization is server-owned and identical for create, rename, lookup, search, import, and API use.

A board-key alias is sufficient to preserve historical ticket keys because ticket numbers never change. Renaming `KFL` to `KANEO` makes `KANEO-144` canonical while `KFL-144` resolves through the board alias to the same ticket.

Do not materialize one alias row per ticket during a board-key rename.

---

## 3. Canonical URLs

Recommended canonical frontend paths:

```text
/:organizationSlug/boards/:boardKey
/:organizationSlug/boards/:boardKey/board
/:organizationSlug/boards/:boardKey/list
/:organizationSlug/boards/:boardKey/timeline
/:organizationSlug/boards/:boardKey/calendar
/:organizationSlug/tickets/:ticketKey
/:organizationSlug/tables/:tableSlug
/:organizationSlug/repos/:repoSlug
```

Ticket example:

```text
/nevrlabs/tickets/KFL-144
```

The explicit `tickets` segment avoids collisions with settings, invitations, tables, repositories, and future organization routes. It is less cute than `/nevrlabs/KFL-144` and far less fragile.

Canonical API paths:

```text
GET /api/organizations/:organizationSlug/tickets/:ticketKey
GET /api/organizations/:organizationSlug/boards/:boardKey
```

Opaque-ID endpoints remain compatibility aliases during migration.

---

## 4. Resolver contract and failover

Resolution is deterministic and always organization-scoped.

### Organization resolution

1. Match current normalized organization slug.
2. Match organization slug alias.
3. For legacy routes only, match opaque organization ID.
4. Otherwise return 404.

### Board resolution

1. Within the resolved organization, match current normalized board key.
2. Match board-key alias.
3. For legacy routes/API compatibility only, match opaque board ID.
4. Otherwise return 404.

### Ticket resolution

1. Parse ticket key strictly as `<board-key>-<positive integer>`, splitting at the final hyphen-number suffix.
2. Resolve board key through current key, then alias.
3. Resolve ticket by `(board_id, number)`.
4. For legacy routes only, resolve opaque ticket ID.
5. Apply normal resource authorization after identity resolution.
6. Return the same 404 for nonexistent and unauthorized resources.

### Redirect behavior

Any request using:

- Organization alias.
- Board-key alias.
- Legacy UUID route.
- Legacy `/task/` terminology.

must return/render the resource and replace the browser URL with the canonical current slug/key route.

Frontend navigation should use `replace`, not add another browser-history entry.

API responses should include:

```json
{
  "id": "opaque-id",
  "key": "KANEO-144",
  "number": 144,
  "organization": { "id": "...", "slug": "nevrlabs" },
  "board": { "id": "...", "key": "KANEO" }
}
```

Legacy API aliases may add deprecation headers but must not redirect mutating HTTP requests across methods.

---

## 5. Rename transactions

### Organization slug rename

One transaction:

1. Lock organization row.
2. Normalize and validate new slug.
3. Reject if current/alias namespace already owns it.
4. Insert old current slug into alias table if absent.
5. Update organization current slug.
6. Emit `organization.slug_changed` with old/new values.
7. Preserve all previous aliases.

### Board key rename

One transaction:

1. Lock board row.
2. Normalize and validate new key.
3. Reject if any current board key or alias in the organization owns it.
4. Insert old current key into board alias table if absent.
5. Update current board key.
6. Increment board identity revision.
7. Emit `board.key_changed` with old/new values.
8. Do not update ticket rows; their number and board ID are unchanged.

### Renaming back

If board `KFL` becomes `KANEO`, then later becomes `KFL` again:

- `KFL` may become current because its alias belongs to the same board.
- `KANEO` becomes/retains an alias.
- Both keys resolve to the board.
- Canonical key is whichever is currently stored on the board.

---

## 6. Validation

Organization slug:

- Lowercase canonical output.
- ASCII letters, digits, and internal hyphens.
- 2–63 characters.
- No leading/trailing/consecutive hyphens.
- Reserved words rejected: `api`, `auth`, `assets`, `admin`, `settings`, `invitations`, `tickets`, `boards`, `repos`, `tables`, `new`.

Board key:

- Uppercase canonical display.
- ASCII letters first; then letters, digits, or hyphens.
- 2–20 characters.
- Cannot end in `-<digits>` ambiguity if parsing would produce an empty/invalid board key.
- Reserved route words rejected.

Ticket key parser:

- Case-insensitive input.
- Canonical uppercase output.
- Split using the final `-(\d+)` suffix so keys such as `CORE-API-42` work.
- Reject zero, negatives, decimals, whitespace, and leading/trailing junk.

---

## 7. Search and copy behavior

Global search should accept:

- Canonical ticket key.
- Any historical ticket key alias.
- Bare ticket number only when already scoped to one board.
- Opaque UUID as a final compatibility lookup.

Search result payloads should return canonical `ticketKey`, not merely `boardSlug` plus `taskNumber`.

Copy actions:

- Copy ticket key → `KFL-144`.
- Copy ticket link → canonical slug URL.
- Copy branch name → based on canonical key at copy time.

Old copied links continue resolving after every organization/board rename.

---

## 8. Public compatibility

During the Ticket terminology migration:

- New canonical routes and payloads use `ticket`, `ticketId`, and `ticketKey`.
- Existing `/task`, `taskId`, and UUID routes remain supported aliases.
- Generated links immediately use canonical ticket routes.
- Existing rich-text `<kaneo-issue-link task-id="...">` embeds continue reading opaque IDs but new serialization should write `ticket-id` and canonical key metadata when compatibility permits.
- Webhooks dual-publish or version `ticket.*` versus legacy `task.*` events with stable event IDs and explicit deprecation.
- GitHub/Gitea sync keeps provider issue numbers separate from Kaneo ticket keys.

---

## 9. Database migration outline

1. Add normalized identity columns if needed (`board.key`, identity revisions).
2. Create alias tables and indexes.
3. Backfill organization current slugs into no alias rows yet; aliases are historical only.
4. Backfill `board.key` from current `board.slug` using deterministic conflict resolution.
5. Detect duplicate board slugs within organizations before adding uniqueness.
6. Add case-insensitive unique guarantees using normalized columns or `lower(...)` indexes.
7. Add resolver service and compatibility routes.
8. Switch generated links and search payloads.
9. Only then retire ambiguous `board.slug` naming from domain code.

If duplicate board keys exist during backfill, do not silently renumber. Produce a migration report and require deterministic generated keys plus preserved aliases where unambiguous.

---

## 10. Required tests

- Current organization slug resolves.
- Every historical organization alias resolves and canonicalizes.
- Current board key resolves within its organization.
- Historical board keys resolve to current canonical board URL.
- Same board key may exist in different organizations.
- Historical key cannot be claimed by another board in the same organization.
- Board rename preserves all ticket links without touching ticket rows.
- Rename-back keeps both historical keys resolvable.
- `CORE-API-42` parses correctly.
- Case-insensitive input canonicalizes.
- UUID legacy routes canonicalize.
- Unauthorized and missing return indistinguishable 404s.
- Concurrent board-key renames cannot claim the same key.
- Ticket-number allocation remains unique under concurrency.
- Deleted ticket numbers are never reused.
- Search, copy link, notifications, comments, editor embeds, webhooks, and integrations all generate canonical ticket keys.

---

## 11. Dependency order

1. KFL-270 identity/alias foundation.
2. KFL-119 complete Ticket terminology and canonical public contracts.
3. Tables typed `ticket_reference` field and relation picker.

Tables must not introduce a `task_reference` field or UUID-only ticket relation while this migration is pending.

---

## 12. Decision

Adopt:

> Opaque immutable internal IDs; mutable human-readable organization slugs and board keys; permanent alias history; board-local immutable ticket numbers; canonical ticket keys derived as `<current-board-key>-<number>`; all legacy keys and UUID routes resolve and canonicalize forever.

This preserves readable URLs without confusing mutable labels with persistence identity.