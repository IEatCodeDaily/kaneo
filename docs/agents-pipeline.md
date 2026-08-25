# Agent implementation pipeline (DAG)

Every KFL implementation ticket flows through this stage DAG. Stages are strictly ordered;
a stage may only start when its predecessor has a recorded PASS. The orchestrator (Talos)
is the only authority that advances stages, commits code, or writes tracker state.

```text
S1 spec-review ──> S2 implementation ──> S3 qc-review ──> S4 merge-check ──> In Review
                        ^                     │
                        └──── REWORK ─────────┘   (loop until QC passes, max 3 cycles)
```

## Stages

### S1: Requirement & architecture review (reviewer agent)
- Input: ticket body, architecture doc (`docs/plans/2026-08-25-domain-resource-projects-initiatives-architecture.md`), current code.
- Duties: reconcile ticket premise with reality (tracker-driven-task-execution Rule 3),
  produce an implementation spec: files to touch, contracts, test plan, out-of-scope list.
- Output: `PASS spec` (written to the stage file) or `FAIL premise` with findings.
- A FAIL goes to the orchestrator, never silently to implementation.

### S2: Implementation (implementer agent — OMP)
- Input: the S1 spec verbatim. The implementer does not reinterpret the ticket.
- Duties: RED -> GREEN -> refactor per AGENTS.md; negative control captured; focused tests pass.
- Constraints: no commit/stash/checkout, no tracker writes, probes in /tmp only.
- Output: worktree diff + self-report with verbatim RED and gate results.

### S3: QC review (reviewer agent — different model from implementer)
- Input: S1 spec + the actual diff (`git diff` + new files), NOT the implementer's summary.
- Duties: two-stage review — spec compliance first, then code quality
  (subagent-driven-development). Replay the negative control. Re-run focused tests.
- Output: `PASS` or `REWORK` with a concrete defect list. REWORK returns to S2 with
  the defect list appended to the spec. Max 3 cycles, then escalate to the human.

### S4: Merge check (orchestrator, not delegated)
- Full gates: `pnpm test`, `pnpm exec biome ci .` (no NEW errors vs HEAD baseline), `pnpm build`.
- Diff audit: ticket-owned paths only; no worker debris; no peer work swept in.
- Commit with Zephyr trailer; tracker proof comment + In Review (never Done).

## Stage state file

Per ticket: `.wayfinder/pipeline/KFL-<n>.json` — committed with the ticket's final commit.

```json
{
  "ticket": "KFL-366",
  "stages": [
    {"stage": "spec-review",   "status": "pass", "agent": "...", "at": "...", "artifact": ".wayfinder/pipeline/KFL-366.spec.md"},
    {"stage": "implementation","status": "pass", "agent": "...", "at": "...", "cycles": 1},
    {"stage": "qc-review",     "status": "pass", "agent": "...", "at": "...", "artifact": ".wayfinder/pipeline/KFL-366.qc.md"},
    {"stage": "merge-check",   "status": "pass", "agent": "orchestrator", "at": "...", "commit": "<sha>"}
  ]
}
```

Enforcement rules:
1. An agent brief for stage N always includes the stage file; the agent must refuse
   (report and stop) if stage N-1 lacks `"status": "pass"`.
2. Stage artifacts (spec, QC verdict) are files, not chat summaries — they survive timeouts.
3. Ticket-level ordering stays in Kaneo native `blocks` edges; stage-level ordering lives here.
4. Model diversity: S3 reviewer must be a different model family than the S2 implementer.
