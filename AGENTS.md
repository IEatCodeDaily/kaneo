# AGENTS.md — Kaneo fork operating contract

Canonical contract for every AI agent (Claude Code, Codex, Cursor, Hermes) working
this repo. CLAUDE.md defers to this file. Read it before touching code.

Applies to the `stellarc/*` fork branches (IEatCodeDaily/kaneo). Upstream is
`usekaneo/kaneo`; we cherry-pick, we don't blind-merge.

---

## 1. The loop (every ticket)

KFL ticket → branch → **RED** → **GREEN** → refactor → gates → self-review → ship.

1. **Ticket first.** Work from a KFL board card (kaneo.entelechia.cloud). No card = no work.
   Read its description and comments before writing anything.
2. **Branch.** `stellarc/<short-slug>` off the current stellarc head.
3. **RED — write the failing test first.** For every behaviour change, write the test
   before the implementation. Run it. **Paste the failing output** into the work log.
   A change with no test that first failed is not done.
4. **GREEN — minimum code to pass.** Only enough to make the test green. No new
   abstraction, config, or interface that the test doesn't force.
5. **Refactor.** Tests stay green. Separate step — never mixed with GREEN.
6. **Gates** (§3) must pass locally before commit.
7. **Self-review** (§4), then ship (§5).

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

## 5. Shipping to production (task.noovoleum.site)

1. Commit on `stellarc/*` with trailer
   `Authored-by: Zephyr (AI Assistant) <raisalpwardana+zephyr@gmail.com>`, push.
2. Build image: `gh workflow run docker.yml -R IEatCodeDaily/kaneo --ref <branch> -f version=X.Y.Z -f latest=true` (gh is authed on Talos).
3. Bump the tag in `noovoleum/infra-deploy-ucollect-internal-prod` →
   `stacks/kaneo/compose.yml`, push **directly to main** (rebase first). Komodo redeploys.
4. Image tag ≠ UI version. The footer reads root `package.json` version; bump it there
   if you want the footer to track the release.

## 6. Upstream

Cherry-pick individual commits (`git cherry-pick -x <sha>`), never merge the branch —
the fork has diverged >1200 files. Security fixes first. Track picks as KFL cards.

## Referenced skills (load when relevant)

`test-driven-development`, `negative-control-testing`, `self-verification-discipline`,
`assert-the-shipped-artifact`, `requesting-code-review`, `code-review`, `writing-plans`,
`kaneo-development`, `komodo-compose-stack-deploys`.
