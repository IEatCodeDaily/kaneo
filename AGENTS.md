# AGENTS.md — Kaneo fork operating contract

Canonical contract for every AI agent (Claude Code, Codex, Cursor, Hermes) working
this repo. CLAUDE.md defers to this file. Read it before touching code.

Applies to the fork (IEatCodeDaily/kaneo). `main` is the only long-lived branch.
Upstream is `usekaneo/kaneo`; we cherry-pick, we don't blind-merge.

---

## 1. The loop (every ticket)

KFL ticket → branch → **RED** → **GREEN** → refactor → gates → self-review → ship.

1. **Ticket first.** Work from a KFL board card (kaneo.entelechia.cloud). No card = no work.
   Read its description and comments before writing anything.
2. **Branch.** `<type>/<short-slug>` (`feat/`, `fix/`, `chore/`, …) off `origin/main`.
3. **RED — write the failing test first.** For every behaviour change, write the test
   before the implementation. Run it. **Paste the failing output** into the work log.
   A change with no test that first failed is not done.
4. **GREEN — minimum code to pass.** Only enough to make the test green. No new
   abstraction, config, or interface that the test doesn't force.
5. **Refactor.** Tests stay green. Separate step — never mixed with GREEN.
6. **Gates** (§3) must pass locally before commit.
7. **Self-review** (§4), then open a PR to `main` (§5).

## 2. TDD discipline (non-negotiable)

- **Red/green TDD.** Test first, confirm it fails, then implement. This is the single
  rule that matters most — agents default to writing tests that pass by construction
  (they verify what the code does, not what it should). Invert that.
- **Negative control.** Prove the test can fail: it must go red without your change.
  A test that's green before you write the code proves nothing. See the
  `negative-control-testing` skill.
- **Minimality check (Ponytail).** New code not exercised by a test is suspect —
  justify it or delete it. No interface with one implementation, no config for a value
  that never changes, no "for later" scaffolding. Coverage flags unexercised lines;
  treat each as "justify or delete."
- **Test the shipped artifact**, not a lookalike. Assert against real behaviour
  (see `assert-the-shipped-artifact`, `self-verification-discipline`).
- Money/security/permission paths always get a test — never skipped for "trivial."

## 3. Gates (must be green before commit)

```
pnpm test           # vitest unit — RED/GREEN suite
pnpm exec biome ci .  # lint + format, zero warnings
pnpm build          # type + build across the monorepo
```
API changes also: `pnpm --filter @kaneo/api test:integration` (needs a Postgres).
Pre-commit runs biome + affected tests + build; do not `--no-verify` past a real failure.
CI additionally enforces a **coverage floor** — a PR may not drop coverage below the
threshold in `vitest.config.ts`. Raise the floor when you raise coverage; never lower it.

## 4. Self-review before shipping

- Re-read the diff. Does every new line earn its place? (Ponytail ladder.)
- Did the test actually fail first? (Negative control.)
- i18n: a new UI string needs the key in BOTH `en-US.json` and `schema.json`.
- DB: schema change → new migration in `apps/api/drizzle/`, NULLable where existing
  rows have no value, no destructive default.
- Reuse before adding: a helper/pattern a few files over beats a new one.
- Load `requesting-code-review` for anything non-trivial.

## 5. Shipping: PR to main is the whole job

```
feature branch ──PR──▶ main ──auto──▶ kaneo.entelechia.cloud   (preview, always = main)
                         └──manual Release workflow──▶ vYYYY.MMDD.HHmm image ──▶ task.noovoleum.site
```

1. **PR to `main`.** Push your branch, `gh pr create -R IEatCodeDaily/kaneo --base main`.
   Commits carry an `Authored-by: <Agent> (AI Assistant)` trailer. Main is PR-only:
   no direct pushes; required checks are CI (`lint`, `unit`, `integration`, `build`,
   `docker-build`) and UI render (`web-checks` = web typecheck + web suite, `render` =
   seeded screenshots, artifact `ui-shots`); the branch must be up to date. Merge
   with squash.
2. **Entelechia deploys itself.** Within ~5 min of CI passing on the new main
   commit, talos builds a clean checkout of it, backs up the DB, cuts over and
   health-checks (auto-rollback). The result is the `entelechia` commit status on
   the main commit. **Never deploy a branch or a worktree to entelechia by hand** —
   no systemd drop-ins, no mirrors. To preview unmerged work, use the UI render
   workflow's screenshots. Mechanism: `deploy/entelechia/`.
3. **Stable release = manual.** The owner runs Actions → **Release** on `main`. It
   refuses a commit whose CI did not pass, stamps `YYYY.MMDD.HHmm` (WIB), pushes
   `ghcr.io/ieatcodedaily/kaneo:<version>` (+ `latest`), tags `v<version>` and
   publishes a GitHub Release. The app footer shows that version (entelechia shows
   `main-<sha>`).
4. **Production** pins the release tag in `noovoleum/infra-deploy-ucollect-internal-prod`
   → `stacks/kaneo/compose.yml` (PR there). Komodo redeploys. Only on the owner's go.

## 6. Upstream

Cherry-pick individual commits (`git cherry-pick -x <sha>`), never merge the branch —
the fork has diverged >1200 files. Security fixes first. Track picks as KFL cards.

## Referenced skills (load when relevant)

`test-driven-development`, `negative-control-testing`, `self-verification-discipline`,
`assert-the-shipped-artifact`, `requesting-code-review`, `code-review`, `writing-plans`,
`kaneo-development`, `komodo-compose-stack-deploys`.
