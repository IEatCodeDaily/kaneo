# Kaneo Domains and Resources Architecture Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task. Before implementation, promote the approved architecture section into `docs/plans/2026-08-25-domain-resource-projects-initiatives-architecture.md` and update KFL-221 with the agreed product definition.

**Goal:** Add first-class Projects and Initiatives without making Boards team-first containers or conflating durable resources, temporary delivery, strategic intent, and permissions.

**Architecture:** Kaneo separates durable **Resources** (`board`, `repository`, `table`, `document`) from coordinating **Domains** (`team`, `project`, `initiative`). Boards remain the mandatory workflow and ticket-identity boundary. Projects coordinate finite outcomes across explicitly scoped tickets and linked resources. Initiatives coordinate a small set of Projects around strategic intent and may link whole resources as context. Resource links, progress scope, and access grants are independent relations.

**Tech stack:** PostgreSQL + Drizzle, Hono API, React/TanStack Router and Query, TypeScript, Vitest, Playwright, existing Kaneo resource-grant and WebSocket invalidation infrastructure.

**Status:** Proposed design and phased implementation plan for KFL-221. No implementation has started.

---

## 1. Product thesis

Kaneo should not copy Linear's team-first ontology wholesale.

Linear's model is optimized around a durable Team owning every issue, workflow, and cycle. Kaneo already has a durable execution boundary: the Board. Forcing ephemeral Projects beneath Teams or turning Projects into special Boards would make temporary, cross-resource work annoying to create, distinguish, and retire.

Kaneo instead adopts this separation:

```text
Organization
├── Resources                         durable work and knowledge surfaces
│   ├── Boards
│   │   └── Tickets
│   ├── Repositories
│   ├── Tables
│   └── Documents
│
└── Domains                           contexts applied over resources
    ├── Teams                         durable responsibility
    ├── Projects                      finite delivery
    └── Initiatives                   strategic investment
```

The governing questions are:

| Object | Governing question | Lifetime |
|---|---|---|
| Team | Who maintains or operates this? | Durable |
| Project | What finite outcome are we delivering? | Temporary |
| Initiative | Why are we investing across these outcomes? | Strategic horizon |
| Board | Where are tickets identified and moved through workflow? | Durable |
| Ticket | What concrete work happens next? | Atomic execution |
| Repository | Where does source and integration context live? | Durable |
| Table | Where does structured project data live? | Durable |
| Document | Where does durable narrative context live? | Durable |
| View | How do I inspect existing canonical objects? | Saved projection |

### Core product statement

> Resources are durable work surfaces. Domains overlay responsibility, delivery, and strategy. Links provide context; explicit scope drives progress; grants control access.

---

## 2. Design laws

These laws are invariants, not implementation suggestions.

### 2.1 Resource is not domain

A Board, Repository, Table, or Document can exist without a Project or Initiative. Closing a Project or Initiative never deletes, archives, or transfers its linked Resources.

### 2.2 Board remains the ticket execution boundary

Every Ticket belongs to exactly one Board. The Board continues to own:

- ticket key namespace and board-local number;
- workflow columns and status ordering;
- ticket defaults;
- board-specific integrations;
- baseline visibility and resource grants.

Project membership adds delivery context but never changes ticket identity or workflow.

### 2.3 Linked resource is not scoped work

Linking the KFL Board to an Initiative means "this Board is relevant context." It does not make every KFL Ticket contribute to Initiative progress.

Progress-bearing scope is explicit:

- Project progress comes from explicitly included Tickets.
- Initiative progress comes from explicitly included Projects.
- Contextual Resource links never affect progress.

### 2.4 Context is not access

Linking a Resource to a Project or Initiative must not grant access automatically. Access is a separate, explicit operation using the canonical resource-grant system.

Temporary grants must record provenance so closure or unlinking removes only the grant created by that Domain. Independently held organization, Team, or direct Resource access remains untouched.

### 2.5 Reuse capability, not identity

Projects and Initiatives may reuse rich text, comments, followers, activity, status selectors, list rows, board renderers, timelines, and resource pickers. They must not be stored as Tickets merely because the UI and collaboration primitives are similar.

### 2.6 Strategy is not execution

Initiatives contain or associate Projects, not Tickets as their primary scope. Projects contain or associate Tickets. Tickets remain execution units.

### 2.7 Outcome is not cadence

Projects end when an outcome is delivered or abandoned. A future Cycle feature would represent recurring execution timeboxes. Projects must not become sprints.

### 2.8 Lifecycle, progress, health, and archive are separate

- **Lifecycle** is the object's declared phase.
- **Progress** is mechanically derived from scoped child work.
- **Health** is authored judgment from the latest update.
- **Archive** hides inactive historical objects without changing what happened.

No one field substitutes for another.

### 2.9 Views never own data

"Active Projects," "Projects at risk," and "Q4 Initiatives" are saved projections. Moving between view groups may mutate canonical properties, but View membership is not a second ownership system.

### 2.10 Initiative scarcity is intentional

An organization should normally have single-digit active Initiatives, dozens of Projects, and hundreds or thousands of Tickets. The product should encourage deliberate Initiative creation through UX and required intent, not an arbitrary hard limit.

---

## 3. Canonical domain model

### 3.1 Team

A Team is a durable responsibility and membership domain.

Required semantics:

- belongs to one Organization;
- has stable membership, including existing transitive sub-Team membership;
- may own or maintain Resources through typed Resource links;
- may be the lead or a contributor to Projects and Initiatives;
- does not own Ticket identity or workflow merely by being linked to a Board.

Team membership and Resource access remain related but distinct concepts.

### 3.2 Project

A Project is a finite, accountable outcome coordinating scoped Tickets and contextual Resources.

Required properties:

```text
Project
├── immutable opaque ID
├── organization ID
├── mutable name
├── canonical slug + permanent aliases
├── icon and color
├── one-line summary
├── rich description / outcome statement
├── success criteria
├── lifecycle status
├── priority
├── lead user
├── optional lead team
├── start date
├── target date
├── archived timestamp / actor
├── created / updated metadata
└── derived progress and latest health
```

Initial lifecycle vocabulary:

```text
planned → started → completed
                  ↘ canceled
```

Do not add `paused` until its behavior differs concretely from `planned` and `started`.

Project relationships:

- zero or one parent Initiative in v1;
- zero or more contributing Teams;
- zero or more explicitly scoped Tickets from any Board in the Organization;
- zero or more Project Milestones;
- zero or more contextual Resource links;
- zero or more periodic Project Updates;
- zero or more followers/subscribers;
- optional explicit temporary Resource grants.

A Ticket belongs to zero or one Project in v1. Multiple Project membership is rejected because it makes progress attribution, prioritization, and milestone ownership ambiguous.

### 3.3 Project Milestone

A Project Milestone is a meaningful delivery checkpoint inside exactly one Project.

Required properties:

- immutable ID;
- Project ID;
- name and optional description;
- optional target date;
- explicit ordering/rank;
- completion timestamp and actor;
- derived progress from scoped Project Tickets assigned to the Milestone.

A Ticket may have zero or one Project Milestone, and that Milestone must belong to the Ticket's Project.

Existing Kaneo Milestones remain Board-scoped and must not be silently repurposed. Project Milestones are new objects because existing milestones are keyed and authorized through a Board.

### 3.4 Initiative

An Initiative is a first-class strategic investment domain grouping a small, deliberate set of Projects.

Required properties:

```text
Initiative
├── immutable opaque ID
├── organization ID
├── mutable name
├── canonical slug + permanent aliases
├── icon and color
├── objective / strategic narrative
├── success criteria
├── owner / sponsor
├── optional lead team
├── lifecycle status
├── priority
├── target horizon or target date
├── archived timestamp / actor
├── created / updated metadata
└── derived project roll-up and latest health
```

Initial lifecycle vocabulary:

```text
planned → active → completed
                 ↘ canceled
```

Initiative relationships:

- zero or more Projects;
- zero or more contextual Resource links, including entire Boards;
- zero or more updates;
- optional followers/subscribers;
- optional contributing Teams;
- optional explicit temporary Resource grants later.

An Initiative is not a Ticket and does not inherit Board workflow, ticket number, Ticket assignment, or Ticket automation.

### 3.5 Project and Initiative Updates

Updates are authored, timestamped interpretations of delivery state.

Required fields:

- Domain type and ID, or separate type-safe tables;
- author;
- rich content;
- health: `on-track`, `at-risk`, or `off-track`;
- created timestamp;
- immutable edit history or edited timestamp according to existing collaboration conventions.

Latest health is derived from the newest Update. "No update" is a presentation state, not a stored health value. Update freshness must be visible.

### 3.6 Domain Resource Links

A Domain Resource Link associates a Team, Project, or Initiative with a durable Resource without transferring ownership.

Resource types:

- `board`;
- `repo`;
- `table`;
- `document` once Documents become first-class.

Relationship vocabulary must be typed by Domain rather than a meaningless generic `contains`:

```text
Team       owns | maintains
Project    context | dependency | deliverable
Initiative context | supporting
```

Required link metadata:

- Domain type and ID;
- Resource type and ID;
- relationship;
- optional label/note;
- rank/order;
- creator and timestamp.

The API must verify the Domain and Resource belong to the same Organization and that the caller can discover both before creating the link.

### 3.7 Scoped Ticket Membership

Project Ticket membership is separate from generic Resource links.

Required fields:

- Project ID;
- Ticket ID;
- optional Project Milestone ID;
- rank/order if manual ordering is supported;
- added by and added at.

Constraints:

- unique Ticket ID across active Project memberships in v1;
- Project and Ticket must belong to the same Organization through the Ticket's Board;
- Milestone, when set, must belong to the same Project;
- removing Project membership clears Project Milestone membership atomically;
- deleting or archiving a Project does not delete or archive Tickets.

### 3.8 Initiative Project Membership

Initiative membership is separate from Resource links.

Required fields:

- Initiative ID;
- Project ID;
- rank/order;
- added by and added at.

Constraints:

- a Project belongs to zero or one Initiative in v1;
- Initiative and Project belong to the same Organization;
- removing membership does not alter the Project lifecycle;
- archiving an Initiative does not archive its Projects.

---

## 4. Progress and health contracts

### 4.1 Project progress

V1 progress is derived from explicitly scoped, non-deleted, non-archived Tickets:

```text
completed tickets / eligible tickets
```

Rules:

- `done` counts completed;
- `canceled` and `duplicate` are excluded from the denominator rather than counted complete;
- active workflow and backlog statuses remain incomplete;
- zero eligible Tickets returns `null` / "No scoped work," not a misleading `0%`;
- estimates or weights are deliberately out of scope for v1.

The API owns this calculation. Clients render the returned aggregate and do not recreate status semantics.

### 4.2 Project Milestone progress

Use the same eligibility rules, limited to Project Tickets assigned to that Milestone.

### 4.3 Initiative progress

V1 Initiative progress rolls up Project completion, not all Tickets from linked Resources.

Expose at least:

- total Projects;
- completed Projects;
- active Projects;
- Projects at risk/off track;
- optional aggregate percentage only after the weighting decision is explicit.

Default recommendation: display `completed / total Projects` plus per-Project progress. Do not average percentages blindly because a two-ticket Project and a two-hundred-ticket Project are not automatically equivalent.

### 4.4 Health

Health is the latest authored Update:

- `on-track`;
- `at-risk`;
- `off-track`;
- presentation-only `no-update` when no Update exists;
- presentation warning when the latest Update is stale beyond a configurable display threshold.

No algorithm silently changes authored health.

---

## 5. Access-control architecture

### 5.1 Baseline

Projects and Initiatives are Organization-scoped, but they need explicit visibility semantics before shipping.

Recommended v1:

- default baseline follows the Organization's default Resource privilege;
- extend the existing resource-grant vocabulary to include `project` and `initiative`;
- reuse canonical Organization membership, Team membership, transitive Team membership, and privilege evaluation;
- never create separate ad hoc "Project members can see everything" authorization.

### 5.2 Information leak prevention

A user who can see a Project but cannot see one linked Resource or scoped Ticket must not receive that object's title, key, count, or sensitive metadata.

API projections should return:

- visible linked objects normally;
- hidden contribution counts only if the product explicitly approves that disclosure;
- otherwise omit inaccessible objects and make aggregate behavior explicit.

Load-bearing permission tests must prove unauthorized and nonexistent IDs are indistinguishable where the existing resource model requires 404 behavior.

### 5.3 Temporary grants

Temporary access is useful but is not part of the first Project slice.

When implemented, each grant must include provenance:

```text
resource_grant_source
├── resource grant ID
├── source type: project | initiative
├── source ID
├── Domain Resource Link ID
└── created timestamp
```

Closure/unlinking removes only grants with matching provenance. It must never remove access inherited through another Team, Organization baseline, another Domain, or a direct grant.

---

## 6. Information architecture and UX

### 6.1 Organization navigation

Separate organization navigation into Domains and Resources without adding noisy nested sidebars:

```text
Plan
- Initiatives
- Projects

Work
- My Tickets
- Inbox
- Boards
- Repositories
- Tables
- Documents (when available)

People
- Teams
- Members
```

Circle (`ln-dev7/circle`, reviewed at commit `778598503e680b4c658d694dd9f65351ee48b3d3`) is a visual reference, not a data-model authority.

Borrow from Circle:

- workspace-level separation of Initiatives, Projects, Views, Teams, and Members;
- dense, readable Project rows with lifecycle, progress, lead, priority, health, and freshness;
- Project detail separation into summary, description, resources, milestones, updates, and activity;
- authored health Updates;
- list/table/timeline display switching and compact filtering patterns.

Reject from Circle:

- mandatory `teamId` on every Project;
- URL-only generic resources;
- hard-coded stored completion percentages;
- mock-data relationships as backend architecture;
- Initiative as nothing more than `projectIds[]`.

### 6.2 Projects overview

Canonical route:

```text
/dashboard/organization/:organizationSlug/projects
```

Views:

- list/table as default;
- timeline by start/target date;
- optional compact cards only if they add information rather than decoration.

Columns:

- Project;
- lifecycle;
- health and update freshness;
- progress;
- lead;
- lead/contributing Teams;
- Initiative;
- target date;
- priority.

Default sections:

- Active;
- Planned;
- Completed;
- Canceled/Archived behind filters.

### 6.3 Project detail

Canonical route:

```text
/dashboard/organization/:organizationSlug/projects/:projectSlug
```

Default tab is **Overview**, not a Kanban clone.

```text
Project header
├── identity, lifecycle, health, lead, dates, progress
├── actions and follow control

Overview
├── outcome summary and success criteria
├── latest update
├── milestones
├── linked resources
├── contributors
└── recent activity

Tickets
├── list
├── board projection
└── timeline/calendar projection

Updates
└── authored update history

Activity
└── meaningful Domain events
```

The Ticket views reuse existing Ticket renderers and filters but query explicit Project membership across Boards. Ticket cards retain Board key/status and link back to canonical Ticket routes.

### 6.4 Initiatives overview

Canonical route:

```text
/dashboard/organization/:organizationSlug/initiatives
```

Initiatives should feel scarcer than Projects:

- no global one-key rapid creation shortcut in v1;
- creation requires objective, owner, lifecycle, and target horizon/date;
- default presentation emphasizes active Initiatives and stale updates;
- completed Initiatives remain reviewable as historical strategy.

### 6.5 Initiative detail

Canonical route:

```text
/dashboard/organization/:organizationSlug/initiatives/:initiativeSlug
```

Default Overview contains:

- objective and success criteria;
- owner/sponsor and lead Team;
- latest health Update;
- linked Projects with progress and health;
- contextual Resources, including whole Boards;
- target horizon/date;
- recent activity.

A linked Board appears under Resources. It never silently contributes every Ticket to progress.

### 6.6 Creation flows

Project creation should be lightweight enough for ephemeral work:

Required:

- name;
- outcome summary;
- lead;
- lifecycle (default `planned`).

Optional during creation:

- lead/contributing Teams;
- target date;
- Initiative;
- initial Tickets;
- linked Resources.

Initiative creation should be more deliberate:

Required:

- name;
- objective;
- success criteria;
- owner;
- lifecycle;
- target horizon/date.

The UI may warn when the proposed Initiative appears Project-sized, but no arbitrary hard count limit is imposed.

---

## 7. Routing and identity

Use organization-scoped, human-readable routes consistent with Kaneo's canonical Ticket identity direction.

```text
/:organizationSlug/projects/:projectSlug
/:organizationSlug/initiatives/:initiativeSlug
```

Internally preserve opaque immutable IDs. Project and Initiative slugs:

- are unique case-insensitively within one Organization;
- are mutable only through explicit rename;
- retain permanent historical aliases;
- never expose unauthorized existence during resolution;
- use shared server-owned normalization.

Do not revive orphaned workspace-era Project routes such as `/dashboard/workspace/:workspaceId/project/:projectId/board`.

---

## 8. Proposed persistence model

Names are conceptual; final Drizzle names must follow nearby schema conventions.

```text
project
project_slug_alias
project_team
project_ticket
project_milestone
project_update

initiative
initiative_slug_alias
initiative_team
initiative_project
initiative_update

domain_resource_link
resource_grant_source             later temporary-access phase
```

### 8.1 Project table

Key columns:

- `id`;
- `organization_id`;
- `slug`;
- `name`, `icon`, `color`;
- `summary`, `description`, `success_criteria`;
- `status`, `priority`;
- `lead_user_id`, `lead_team_id`;
- `start_date`, `target_date`;
- `archived_at`, `archived_by`;
- `created_at`, `created_by`, `updated_at`.

### 8.2 Initiative table

Key columns:

- `id`;
- `organization_id`;
- `slug`;
- `name`, `icon`, `color`;
- `objective`, `description`, `success_criteria`;
- `status`, `priority`;
- `owner_user_id`, `lead_team_id`;
- `target_horizon`, `target_date`;
- `archived_at`, `archived_by`;
- `created_at`, `created_by`, `updated_at`.

### 8.3 Association strategy

Use dedicated association tables for progress-bearing membership:

- `project_ticket`;
- `initiative_project`.

Use `domain_resource_link` only for contextual Resource relationships. Do not put Project ID directly on `task` if the association needs metadata, milestone assignment, authorship, and future history. A dedicated table enforces the semantic boundary and keeps Ticket storage Board-centric.

### 8.4 Polymorphism tradeoff

A generic `domain_resource_link` reduces four duplicated link tables but weakens ordinary foreign keys because Resource IDs target multiple tables.

Recommended implementation:

- use one controlled link table only if the repository already has a proven polymorphic Resource resolver and all writes perform strict same-Organization validation;
- otherwise create type-safe tables (`project_board`, `project_repo`, etc.) first and expose a unified API projection;
- do not accept an unvalidated free-form `resourceType/resourceId` pair merely for schema elegance.

This is an implementation decision to settle in the schema spike before migration code is written.

---

## 9. API contract direction

Canonical API roots:

```text
/api/project
/api/initiative
```

Required Project capabilities:

- list/create/get/update/archive;
- resolve by Organization + slug/alias;
- add/remove/reorder scoped Tickets;
- create/update/reorder/complete Milestones;
- attach/detach/reorder contextual Resources;
- add/remove contributing Teams;
- publish/list Updates;
- return server-derived progress and latest health.

Required Initiative capabilities:

- list/create/get/update/archive;
- resolve by Organization + slug/alias;
- attach/detach/reorder Projects;
- attach/detach/reorder contextual Resources;
- add/remove contributing Teams;
- publish/list Updates;
- return Project roll-ups and latest health.

Mutation payloads must set fields explicitly. Read projections must never leak inaccessible linked Resources or Tickets.

### Event and cache contract

Every mutation that changes a visible Domain projection must:

1. commit canonical storage;
2. emit an Organization-scoped domain event;
3. broadcast through the existing push channel;
4. invalidate all affected query families, including overview, detail, progress, linked object, and sidebar counts.

Do not rely on React Query focus/mount refetch; Kaneo deliberately disables those paths and assumes push-driven freshness.

---

## 10. Current-code constraints and migration warnings

Repository findings that constrain implementation:

- Active hierarchy is Organization → Board → Ticket.
- `task.boardId` is mandatory; Board owns workflow columns and board-local Ticket numbers.
- Existing Milestones are strictly Board-scoped.
- Existing resource grants support Boards, Repositories, and Tables but not yet Projects or Initiatives.
- Organization overview already contains useful table/timeline/progress patterns.
- The live API has no mounted Project router.
- Orphaned workspace-era Project code imports nonexistent `projectTable` / `task.projectId` fields and uses obsolete ID routes.
- `apps/api/src/board/controllers/reorder-projects.ts` is legacy Project code despite its misleading location.

Implementation must inventory and delete, quarantine, or fully replace these false friends before enabling new routes. Partially reviving them would create two incompatible Project concepts.

---

## 11. Explicit non-goals for v1

- Nested Projects or nested Initiatives.
- Multiple Projects per Ticket.
- Initiative-to-Ticket direct progress membership.
- Project-specific Ticket workflows or statuses.
- Project-owned Ticket identity.
- Project-specific custom fields.
- Configurable Project/Initiative lifecycle vocabularies.
- Cycles/sprints.
- Estimate-weighted progress.
- Automated or AI-authored health.
- Dependency graph auto-scheduling.
- Budgeting, capacity planning, or portfolio finance.
- Automatic access grants merely because a Resource is linked.
- Hard limits on active Initiative count.
- Copying Circle's source components wholesale.

---

## 12. Delivery phases

### Phase 0: Ratify architecture and clean false friends

Deliverables:

- this document promoted into `docs/plans/`;
- KFL-221 description replaced with the agreed Project/Initiative definition;
- separate tracker slices created only where no existing ticket covers them;
- stale workspace-era Project code inventoried and removed or explicitly quarantined;
- schema polymorphism decision recorded.

Exit gate: no contributor can mistake the legacy Project code for the target architecture.

### Phase 1: Project foundation

Deliverables:

- Project storage, slug aliases, lifecycle, lead, dates, and resource-grant integration;
- organization-scoped CRUD and resolver;
- Projects overview and Project Overview detail;
- explicit Ticket membership across Boards;
- server-derived progress;
- contextual Board/Repository/Table links with no implicit access changes.

Exit gate: a user can create a Project, include Tickets from multiple Boards, link Resources, close the Project, and prove no Resource or Ticket ownership changed.

### Phase 2: Project delivery and communication

Deliverables:

- Project Milestones;
- Project Updates and health freshness;
- contributing Teams;
- Project Ticket list/board/timeline projections;
- follow/subscription and activity integration.

Exit gate: stakeholders can understand outcome, progress, checkpoints, health, and blockers without opening every Ticket.

### Phase 3: Initiative foundation

Deliverables:

- Initiative storage, identity, lifecycle, owner, horizon, Updates, and resource grants;
- Initiatives overview/detail;
- explicit Initiative → Project membership;
- contextual whole-Resource links;
- Project roll-up without contextual Resources affecting progress.

Exit gate: a small set of Initiatives can communicate strategic investment across Projects and entire contextual Resources without becoming Tickets.

### Phase 4: Explicit temporary access

Deliverables:

- opt-in Domain Resource grant operation;
- provenance storage;
- safe closure/unlink revocation;
- UI disclosure of granted privilege and revocation consequences;
- adversarial permission tests.

Exit gate: removing Project-derived access cannot remove access obtained from any other source.

### Phase 5: Saved strategic views and polish

Deliverables:

- saved Project/Initiative filters and presentation settings;
- cross-domain search and command-palette integration;
- performance measurement on populated organizations;
- responsive/mobile polish;
- optional public/read-only roadmap only after permission semantics are proven.

---

## 13. Implementation task plan

Every behavioral task follows Kaneo's required loop: tracker claim → branch → failing test and captured RED output → minimum GREEN implementation → refactor → focused tests → full gates → self-review → served-artifact E2E → proof comment → In Review, never Done.

### Task 1: Promote and ratify the architecture

**Objective:** Make the approved ontology the durable repository and tracker source of truth.

**Files:**

- Create: `docs/plans/2026-08-25-domain-resource-projects-initiatives-architecture.md`
- Modify: KFL-221 description and comments through the agent-key tracker API.

**Steps:**

1. Copy the approved architecture sections from this plan into the durable document.
2. Add a concise decision log naming rejected alternatives: Project-as-Board, Initiative-as-Ticket, team-first Project ownership, and implicit access through links.
3. Update KFL-221 with the new product definition and link/quote the durable design.
4. Add implementation slices only after checking for existing KFL tickets.
5. Verify the exact KFL-221 readback using the agent key.
6. Commit the documentation separately.

### Task 2: Inventory and remove legacy Project false friends

**Objective:** Ensure only one Project concept exists before new storage lands.

**Likely files:**

- Inspect/remove/replace: `apps/api/src/project/**`
- Inspect/remove: `apps/api/src/board/controllers/reorder-projects.ts`
- Inspect/remove/replace: `apps/web/src/components/nav-projects.tsx`
- Inspect/remove/replace: `apps/web/src/hooks/**/project/**`
- Test: add import/reachability tests proving obsolete workspace routes and nonexistent schema contracts are gone.

**TDD:** Write a failing repository-level test that detects active imports/routes using `workspaceId`, `projectTable`, `task.projectId`, or `/dashboard/workspace/.../project`. Prove RED against current legacy artifacts, remove/quarantine them, then prove GREEN.

### Task 3: Resolve association-table strategy

**Objective:** Choose type-safe Resource link tables versus controlled polymorphism using executable schema tests, not aesthetics.

**Files:**

- Inspect: `apps/api/src/database/schema.ts`
- Inspect: `apps/api/src/database/relations.ts`
- Inspect: existing Resource grant and Resource resolution helpers.
- Create: a short ADR section in the durable architecture document.

**Verification:** Demonstrate same-Organization enforcement, deletion behavior, and foreign-key integrity for Board, Repository, and Table links. Prefer dedicated tables if the generic design cannot retain database-backed integrity.

### Task 4: Add Project storage and slug identity

**Objective:** Persist organization-scoped Projects with lifecycle, ownership, aliases, and archive state.

**Files:**

- Modify: `apps/api/src/database/schema.ts`
- Modify: `apps/api/src/database/relations.ts`
- Create: next numbered migration under `apps/api/drizzle/`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: Project schema/identity integration tests under the repository's actual API integration-test root.

**TDD cases:**

- case-insensitive unique Project slug within Organization;
- same slug allowed in different Organizations;
- historical alias resolves forever and cannot be reassigned;
- lifecycle enum rejects Ticket statuses;
- archive does not mutate lifecycle;
- lead and lead Team must belong to the Organization.

### Task 5: Extend canonical permissions to Project

**Objective:** Make Project visibility use the existing Resource privilege lattice.

**Files:**

- Modify: Resource-type constraint and permission resolver files discovered during Task 3.
- Add: fake-boundary authorization tests and real-constructor/integration tests.

**TDD cases:**

- Organization baseline grants expected visibility;
- explicit user and Team grants narrow/broaden only according to canonical precedence;
- transitive Team membership works;
- unauthorized and missing Project resolve identically;
- Project visibility never grants visibility to linked Resources.

### Task 6: Build Project CRUD, resolver, and projections

**Objective:** Mount a canonical organization-scoped Project API.

**Files:**

- Replace/create: `apps/api/src/project/index.ts`
- Create/replace: `apps/api/src/project/controllers/**`
- Modify: `apps/api/src/index.ts`
- Create: API integration tests.

**TDD cases:**

- create/list/get/update/archive;
- slug and alias resolution;
- full explicit update payload behavior;
- Organization isolation;
- inaccessible links omitted from response projections;
- archive preserves Resources and Tickets.

### Task 7: Add explicit Project Ticket membership and progress

**Objective:** Scope Tickets from multiple Boards into one Project without changing Board ownership.

**Files:**

- Modify schema/relations/migration.
- Create Project Ticket controllers and shared progress calculator.
- Add integration tests for cross-Board membership.

**TDD cases:**

- Tickets from two Boards in the same Organization can join one Project;
- cross-Organization Ticket rejected;
- one active Project per Ticket in v1;
- adding/removing membership leaves `task.boardId`, number, status, and column unchanged;
- progress excludes canceled/duplicate and returns no-progress state for zero eligible Tickets;
- unauthorized Tickets cannot be discovered through Project responses.

### Task 8: Add contextual Project Resource links

**Objective:** Link Boards, Repositories, and Tables without changing ownership, progress, or access.

**Files:**

- Add schema/relations/controllers according to Task 3 ADR.
- Reuse existing Resource pickers/resolvers where behavior matches.
- Add integration tests for each Resource type.

**TDD cases:**

- same-Organization link succeeds;
- cross-Organization link fails;
- caller must access both sides;
- link does not grant Resource access;
- link does not alter Project progress;
- deleting/unlinking Project leaves Resource intact.

### Task 9: Build Project overview and detail UI

**Objective:** Ship the Overview-first Project experience using Kaneo components and Circle only as a visual reference.

**Likely files:**

- Create routes under `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/**`
- Create `apps/web/src/components/project/**`
- Create query/mutation hooks under `apps/web/src/hooks/**/project/**`
- Modify `apps/web/src/components/app-sidebar.tsx` and relevant navigation tests.
- Modify i18n source and schema files.

**Component tests:**

- Project rows expose lifecycle, health freshness, progress, lead, Initiative, and target date;
- Overview is the default detail tab;
- inaccessible Resource metadata does not render;
- linked Resource rows are visually distinct from scoped Tickets;
- responsive header and tab behavior preserves navigation.

### Task 10: Add Project Milestones

**Objective:** Add Project-scoped checkpoints without altering existing Board Milestones.

**Files:**

- Add Project Milestone schema/relations/controllers/hooks/components.
- Reuse milestone icon/timeline visuals only where semantics match.

**TDD cases:**

- Milestone belongs to exactly one Project;
- Ticket assignment requires membership in the same Project;
- removing Project membership clears Milestone assignment atomically;
- progress uses only assigned eligible Project Tickets;
- deleting a Milestone never deletes Tickets;
- Board Milestones remain unchanged.

### Task 11: Add Project Updates and health

**Objective:** Publish authored health narratives with visible freshness.

**Files:**

- Add Project Update schema/controllers/hooks/components.
- Reuse rich text/activity primitives.
- Wire notification/follower behavior only after recipient semantics are specified.

**TDD cases:**

- latest Update determines health;
- no Update renders `No update` without storing it as health;
- progress changes do not mutate health;
- stale threshold changes presentation, not stored data;
- update authorship and edit history remain attributable.

### Task 12: Add Project Ticket projections

**Objective:** Reuse Ticket list/board/timeline machinery across scoped Tickets from multiple Boards.

**Files:**

- Create Project Ticket query and grouping adapters.
- Reuse existing Ticket cards/rows and timeline primitives.
- Add mount tests proving each view uses the Project query rather than one Board query.

**TDD cases:**

- each Ticket displays its Board key and canonical identity;
- status grouping does not assume one Board's custom column IDs;
- navigation opens canonical Ticket routes;
- mutation remains delegated to each Ticket's Board workflow;
- mixed-Board timeline does not collide on board-local milestone IDs.

### Task 13: Add Initiative storage and permissions

**Objective:** Persist first-class strategic Initiatives with their own lifecycle and identity.

**Files:**

- Modify schema/relations/migration/journal.
- Extend Resource type and permission resolver.
- Add Initiative integration tests.

**TDD cases:**

- Organization-scoped slug and permanent aliases;
- required objective, owner, success criteria, lifecycle, and horizon/date;
- lifecycle distinct from Project and Ticket statuses;
- archive orthogonal to lifecycle;
- no dependency on Board or Ticket tables.

### Task 14: Add Initiative Project membership and roll-ups

**Objective:** Explicitly scope Projects under Initiatives without altering Project lifecycle.

**Files:**

- Add association table/controllers/shared roll-up calculator.
- Add integration tests.

**TDD cases:**

- Project can belong to zero or one Initiative;
- cross-Organization membership rejected;
- removing membership preserves Project;
- contextual Resource links do not alter roll-up;
- roll-up exposes completed/active/risk counts without naive percentage averaging.

### Task 15: Add Initiative Resources and Updates

**Objective:** Link whole Resources as strategic context and publish authored Initiative health.

**Files:**

- Extend Resource-link controllers/UI to Initiative relation vocabulary.
- Add Initiative Update storage/controllers/UI.

**TDD cases:**

- whole Board link is contextual only;
- linked Board's Tickets do not enter progress;
- link grants no access;
- latest authored Update controls health;
- invisible Resources do not leak metadata.

### Task 16: Build Initiative overview and detail UI

**Objective:** Ship a deliberate, scarce strategic planning experience.

**Likely files:**

- Create routes under `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/initiatives/**`
- Create `apps/web/src/components/initiative/**`
- Create Initiative query/mutation hooks.
- Modify navigation and i18n.

**Component tests:**

- creation requires intent fields;
- active/planned/completed grouping;
- stale health prominently visible;
- Projects and Resources have distinct sections and semantics;
- no rapid Ticket-like creation affordance;
- whole Board links render as context, not work counts.

### Task 17: Wire push-driven freshness

**Objective:** Keep every Domain surface current without focus/mount refetch.

**Files:**

- Extend API event taxonomy and WebSocket broadcast handling.
- Extend web query-key invalidation mapping.
- Add unit/integration tests for each mutation family.

**TDD cases:**

- Ticket status changes update Project progress;
- Project status/update changes update Initiative roll-ups;
- link/membership changes refresh overview and detail;
- Project/Initiative Updates refresh health and freshness;
- no unrelated global cache flush.

### Task 18: Implement temporary Domain-derived grants

**Objective:** Add explicit, provenance-safe temporary Resource access as a later independent slice.

**Files:**

- Add provenance schema/migration.
- Extend Resource grant controller/service.
- Add Project/Initiative grant controls and disclosure UI.
- Add adversarial integration tests.

**TDD cases:**

- no grant on ordinary link;
- explicit Viewer/Edit grant records provenance;
- closing/unlinking removes only matching Domain-derived grant;
- direct, Team, Organization, or another Domain grant survives;
- concurrent grants do not race into accidental revocation;
- privilege cannot exceed caller's delegation authority.

### Task 19: Full verification and live proof

**Objective:** Prove the architecture on the served production-like artifact.

**Commands:**

```bash
pnpm test
pnpm exec biome ci .
pnpm build
pnpm --filter @kaneo/api test:integration
```

**E2E scenarios:**

1. Create two Boards and Tickets with distinct keys/workflows.
2. Create one Project and scope Tickets from both Boards.
3. Link a Board, Repository, and Table contextually.
4. Verify Ticket ownership, keys, statuses, and Resource permissions remain unchanged.
5. Add Project Milestones and publish health Updates.
6. Create an Initiative and attach the Project plus the whole Board as context.
7. Verify only Project membership drives Initiative roll-up.
8. Verify a restricted user sees no inaccessible Resource/Ticket metadata.
9. Close/archive Project and Initiative; verify Resources and Tickets survive unchanged.
10. Capture desktop and mobile screenshots for Projects overview/detail and Initiatives overview/detail.
11. Verify served bundle hash corresponds to the built artifact before claiming UI proof.
12. Post tracker proof and move each completed slice to **In Review**, never Done.

---

## 14. Acceptance criteria

The architecture is correctly implemented only when all of the following are true:

- Projects and Initiatives are first-class organization-scoped objects.
- Teams, Projects, and Initiatives are Domains; Boards, Repositories, Tables, and Documents are Resources.
- Every Ticket remains owned by exactly one Board.
- A Project can scope Tickets from multiple Boards without changing their Board state or identity.
- A Project can link Resources without including every contained Ticket or granting access.
- An Initiative can include Projects and link an entire Board without treating itself as a Ticket.
- Project progress derives only from explicit Ticket membership.
- Initiative roll-up derives only from explicit Project membership.
- Health derives only from the latest authored Update.
- Context links, scoped membership, and access grants are separately represented and separately authorized.
- Existing Board Milestones remain intact; Project Milestones are separate.
- Closing/archiving a Domain does not delete, archive, or transfer linked Resources or child execution objects.
- Unauthorized linked objects cannot be inferred through API projections, counts, search, or UI.
- Legacy workspace-era Project code and routes cannot be reached or mistaken for the new architecture.
- All unit, integration, build, lint, served-artifact, and browser E2E gates pass with screenshot evidence.

---

## 15. Risks and mitigations

### Risk: generic Domain/Resource abstraction becomes an untyped platform framework

Mitigation: share only proven primitives. Keep Team, Project, and Initiative lifecycle and relationship vocabularies explicit. Avoid generic user-configurable Domain types.

### Risk: polymorphic links weaken database integrity

Mitigation: prefer dedicated type-safe association tables unless a controlled resolver and integration tests prove generic links safe.

### Risk: permissions leak through aggregate progress

Mitigation: define projection policy before implementation and test inaccessible children at both API and browser boundaries.

### Risk: cross-Board Ticket views assume one workflow

Mitigation: preserve each Ticket's Board workflow and group by canonical status category or Board-qualified columns rather than mixing raw column IDs.

### Risk: stale React Query projections

Mitigation: every mutation gets an event and scoped invalidation contract; test Ticket → Project → Initiative propagation.

### Risk: Initiative proliferation

Mitigation: deliberate creation UX, required intent fields, stale-update visibility, and education. Do not solve product discipline with a hard database limit.

### Risk: legacy Project code is accidentally revived

Mitigation: remove/quarantine it first and add a regression test against old workspace-era contracts.

### Risk: scope explodes into Cycles, dependencies, budgets, and custom workflows

Mitigation: enforce v1 non-goals and ship in independent tracker slices with explicit exit gates.

---

## 16. Open decisions to settle before schema implementation

1. **Project visibility default:** Organization default privilege versus a dedicated configurable Project baseline.
2. **Resource-link storage:** dedicated type-safe tables versus controlled polymorphic table.
3. **Document boundary:** whether current rich descriptions are sufficient for v1 or first-class Documents must precede Resource links to Documents.
4. **Initiative target:** freeform horizon (`Q4 2026`) plus optional date versus normalized planning-period table.
5. **Project contributor semantics:** explicit user contributors, Teams only, or followers plus lead/contributing Teams.
6. **Hidden contribution aggregates:** omit completely versus disclose anonymized counts to viewers lacking child access.
7. **Completed Project denominator:** whether canceled Projects are excluded from Initiative totals, shown separately, or included as terminal non-completion.
8. **Project Ticket ordering:** explicit manual rank in v1 versus derive from Board position until Project-specific ordering is demanded.
9. **Slug alias rollout:** reuse the existing canonical slug alias machinery directly or first extract a shared resolver helper.
10. **Temporary grants:** Project-only first or shared Project/Initiative provenance from day one of the later access phase.

Recommended defaults are stated throughout this document; none of these should block ratifying the ontology.

---

## 17. Decision record

### Accepted

- Resources and Domains are separate conceptual families.
- Board remains the execution and Ticket identity boundary.
- Projects are finite outcomes and need not belong to a Team.
- Initiatives are first-class and intentionally scarce.
- A Project belongs to zero or one Initiative in v1.
- A Ticket belongs to zero or one Project in v1.
- Whole Resources may be linked contextually to Projects and Initiatives.
- Context links do not imply progress scope or access.
- Project and Initiative health is authored through Updates.
- Circle is a UI reference only.

### Rejected

- Project as a special Board.
- Project nested permanently beneath Team.
- Initiative as a Ticket on a strategic Board.
- Linking a Board as shorthand for including all its Tickets in progress.
- Resource links granting access implicitly.
- Reusing Board Milestones as cross-Board Project Milestones.
- Storing hard-coded progress percentages.
- Reviving obsolete workspace/project ID architecture.

### Deferred

- Cycles.
- Nested Initiatives or Projects.
- Multiple Projects per Ticket.
- Estimate-weighted progress.
- Domain-derived temporary grants until core links and permissions are proven.
- Public roadmaps.
- Portfolio budgeting and capacity planning.

---

## 18. ADR: resource-link storage decision

**Status:** accepted (KFL-365). Settles open decision 16.2.

**Decision:** Resource links to Projects and Initiatives are stored in
dedicated type-safe association tables — `project_board`, `project_repo`,
`project_table_link`, and their Initiative counterparts — not in a generic
polymorphic `domain_resource_link` table.

**Rationale:** the repository has no proven polymorphic Resource resolver,
so a free-form `resourceType`/`resourceId` pair could not be validated or
dereferenced uniformly at write time. Polymorphic IDs targeting multiple
tables also forfeit ordinary foreign-key integrity and cascade semantics,
which per §8.4 is unacceptable without strict same-Organization validation
machinery we do not have.

**Consequences:** each new linkable Resource type costs one small migration
and link table; in exchange every link row keeps a real FK to both sides.
The unified API projection over these tables (one "linked resources" read
shape per Domain) is still required and is unaffected by this choice.
