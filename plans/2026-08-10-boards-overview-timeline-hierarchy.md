# Boards Overview Timeline Hierarchy Implementation Plan

> **For Hermes:** Execute with red/green tests and served-browser proof.

**Goal:** Make the Boards Overview timeline scanable by default and expandable into board-specific planning detail.

**Architecture:** Reuse the existing `BoardsTimeline` grid, sticky name rail, zoom maths, filters, and milestone aggregation. Add local, persisted disclosure state keyed by board id; board aggregate rows remain visible, while expansion reveals milestone rows and scheduled Ticket rows derived from the board-list payload. Do not add dependency drawing in this pass.

**Tech stack:** React, TypeScript, date-fns, existing Gantt helpers, Vitest, Playwright.

---

### Task 1: Model overview timeline detail rows

**Files:**
- Modify: `apps/web/src/components/board/boards-timeline.tsx`
- Test: `apps/web/src/components/board/boards-timeline.test.tsx`

1. Add a failing test: expanded board exposes milestone and scheduled Ticket rows; collapsed board does not.
2. Run the focused test and confirm red.
3. Add structural optional Ticket fields to `TimelineBoard`; build detail rows only from scheduled Tickets.
4. Run test green.

### Task 2: Add disclosure controls

**Files:**
- Modify: `apps/web/src/components/board/boards-timeline.tsx`
- Test: `apps/web/src/components/board/boards-timeline.test.tsx`

1. Add failing tests for default collapsed state, individual toggle, Expand all, Collapse all.
2. Implement localStorage-backed board-ID disclosure state and controls.
3. Run focused test green.

### Task 3: Verify real overview

1. Run focused component tests.
2. Build production web bundle and restart local served web process.
3. Use browser proof on the actual organization overview: collapsed aggregate rows, expanded detail, controls, no errors.
4. Commit and push only after gates pass.

**Non-goals:** dependency creation/propagation, editing timeline dates in the overview, virtualized hierarchy, or changes to board persistence APIs.

**Acceptance:** collapsed board-first overview; meaningful expanded detail; no N+1 hooks beyond existing milestone query; sticky rail remains; bars and markers remain positioned correctly.
