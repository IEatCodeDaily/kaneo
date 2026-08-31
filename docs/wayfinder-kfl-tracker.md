# Kaneo KFL tracker operations

The repository uses the live Kaneo Feature List board at `https://kaneo.entelechia.cloud`.

## Authentication

Use the dedicated agent key from `~/.hermes/mcp-tokens/kaneo-agent.json` as the `x-api-key` header. Never use the user's personal token.

## Scope

- Organization ID: `Im20uAxL7yk1pPfi1tdW9YNLUSOsh1E5`
- Board slug: `KFL`
- Tickets are referenced as `KFL-<number>`.
- New implementation tickets start in `to-do` unless they are only a future proposal, in which case use `planned`.
- Never move completed implementation directly to Done; use In Review after proof.

## API operations

1. Resolve the board with `GET /api/board?organizationId=<id>&includeArchived=true` and select slug `KFL`.
2. Create a ticket with `POST /api/task/<boardId>` and an explicit JSON body containing `title`, `description`, `priority`, `status`, and `userId` when assignment is intended.
3. Update a ticket with `PUT /api/task/<taskId>` using the full existing task payload plus changed fields.
4. Add comments with `POST /api/comment/<taskId>`.
5. Create native dependency or parent links with `POST /api/task-relation/` using `subtask`, `blocks`, or `related`.
6. Read every changed ticket and its relations back before reporting success.

## Planning conventions

- KFL-221 is the parent architecture/epic ticket for Projects and Initiatives.
- Child tickets must be vertical tracer bullets that deliver demonstrable behavior across storage, API, UI, tests, and documentation where applicable.
- Every child names its parent and blockers in its description even when native relations are also created.
- Use native `subtask` links from parent to child and `blocks` links from blocker to blocked ticket.
- Reuse an existing ticket when it already covers the behavior; do not create duplicates.
- Contextual resource links, progress-bearing membership, and access grants are separate concepts.
