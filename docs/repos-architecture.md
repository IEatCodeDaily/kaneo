# Repos — architecture decisions

## Intent

Repositories are a **first-class, organization-level entity**, a sibling of
Boards in the sidebar — not a board setting.

```
Organization
├── Boards          → Tasks        (Kaneo's planning domain)
└── Repos           → Issues, PRs  (mirror of the provider's domain)
```

The two trees are deliberately **not** joined. A GitHub issue is not a task and
is never forced to become one.

## Why

The previous design scoped a GitHub/Gitea integration to a *board* and created
a Kaneo task for every incoming issue (`external_link.task_id` was `NOT NULL`,
so a link could not exist without a task). That forced provider data through
Kaneo's board/column/status model and produced constant impedance mismatch —
"feature-linking hell". Segregating the domains removes the problem instead of
adding mapping rules on top of it.

## Rules

1. `repo` belongs to an `organization`. It has **no** `board_id`.
2. `repo_issue` and `repo_pull_request` belong to a `repo`. They have **no**
   `task_id`, and no foreign key to `task` exists anywhere. Verified with:
   ```sql
   SELECT conname FROM pg_constraint
   WHERE contype='f' AND conrelid::regclass::text LIKE 'repo%'
     AND confrelid::regclass::text='task';   -- must return zero rows
   ```
3. Issues/PRs are **read-only mirrors**. State, labels and numbers are stored
   exactly as the provider reports them. Kaneo does not own this data.
4. Boards keep notification-style integrations only: Discord, Slack, Telegram,
   generic webhooks. GitHub/Gitea were removed from board settings.
5. No UI links an issue/PR to a task. If a relationship is ever wanted it must
   be an explicit, optional, non-enforcing reference — never a required FK.

## Schema

| table | key columns |
|---|---|
| `repo` | `organization_id`, `provider` (`github`\|`gitea`), `owner`, `name`, `config` jsonb, `last_synced_at` |
| `repo_issue` | `repo_id`, `number`, `state`, `labels` jsonb, `url` |
| `repo_pull_request` | `repo_id`, `number`, `state` (`open`\|`closed`\|`merged`), `is_draft`, `head_branch`, `base_branch` |

Uniqueness: one repo per `(organization, provider, owner, name)`; one issue/PR
per `(repo, number)` — so re-syncing upserts instead of duplicating.

Migration: `apps/api/drizzle/0035_repo_entity.sql`, hand-written because
drizzle-kit's stored snapshot predates the terminology rename (applied to the
live DB as raw SQL in `0034`) and therefore offers to *rename* live tables into
the new ones. Do not run `drizzle-kit generate` without checking that prompt.

## Sync

`apps/api/src/repo/services/`
- `sync-github-repo.ts` — GitHub App installation auth, paginates
  `/issues` + `/pulls`, upserts on `(repo_id, number)`. GitHub returns PRs from
  the issues endpoint, so entries carrying `pull_request` are skipped.
- `sync-gitea-repo.ts` — token auth against a self-hosted base URL, same shape.
  Also exports `syncRepo(repoId)`, which dispatches on `repo.provider`.

Merged PRs are reported by both providers as state `closed`; we store `merged`
explicitly when `merged_at` is set.

## Data reset

The two board-scoped integrations and all 13 `external_link` rows were deleted
as part of `0035` (explicitly requested — clean slate, no migration of the old
task↔issue links). Repos are reconnected from the new Repo UI.
