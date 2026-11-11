# design-v3 r3 -> r4 delta

Verify every row against the r4 bytes.

Fixes staged in `docs/design-v3-r4/`; `docs/design-v3-r3/` stays frozen. Input council: design-v3-r3 (`.council/design-v3-r3/OPUS.md`). The GLM r3 seat was cancelled before writing a report, so it has no verdict and no findings here.

| # | Fix | Raised by | Verified at (r4) |
|---|---|---|---|
| 1 | List rows **swap** trailing meta (chip / PR state) for the hover actions in the same slot; no reserved band at rest. DS §2 rule 6 names the two placements (grid first cell reserves, list rows swap) | OPUS R3 M1, OPUS R3 R3-P1 | `pages.py` `.rr .acts`; DS §2 rule 6; 4j below; vision `ticket-resources#list`: chips and PR state end on one right edge |
| 2 | Edit caret `right:var(--space-1)`, after the digits | OPUS R3 S-r3-1 | `kit.css .caret`; 4c+ below |
| 3 | Light cyan `#004a5e`, dark red `#f0806a`; check.py asserts pairwise tone ΔE_ok ≥ 0.10 in both themes | OPUS R3 S-r3-2 | `kit.css:9,22`; `check.py` pairwise loop. Negative control (r3 tones): dark pink/red 0.097, light blue/gray 0.075, light blue/green 0.092 → fail; r4 tones pass |
| 4 | `--cols` Batch name 188, Linked tickets 120 | OPUS R3 S-r3-3 | `kit.css:139` |
| 5 | Grid "Open" icon-only (`aria-label`/`title` "Open row"); `--open-clear` 72→32px | OPUS R3 S-r3-4 | `gen.py` row cell; `kit.css:13` |
| 6 | Chart gridlines at the peak and half the peak, labelled (16 / 8) | OPUS R3 S-r3-5 | `pages.py` `.lc-y` |
| 7 | PR state is muted text, not a stage-coloured chip | OPUS R3 S-r3-6 | `pages.py` resources() |
| 8 | DS §1.1 hues stated in OKLCH (accent 275°, pink 349°, cyan ≈215°) | OPUS R3 S-r3-7 | `DESIGN-SYSTEM.md:46` |
| 9 | render asserts Paper Mono loaded where IDs are drawn | OPUS R3 S-r3-8 | `render.py:30` |
| 10 | negctl.py refuses a missing or dash-prefixed argument and any destination inside the package | OPUS R3 R3-P2 | `negctl.py:11-13`; `negctl.py --help` → usage, rc 1, no directory |
| 11 | Resource-row Open buttons icon-only (`Open row`, `Open pull request`), same as grid row 5 | parent consistency sweep (unnumbered) | `pages.py` res_row(), resources(); vision `ticket-resources#list`: icon-only, no overlap |
| 12 | Render path is GitHub Actions only: `src/render.sh` (build-host wrapper) deleted; render.py / check.py / negctl.py / NOTES point at `.github/workflows/design-render.yml` | parent (unnumbered) | `grep -rn 'render.sh\|fxrun\|build host' docs/design-v3-r4` → nothing |
| 13 | NOTES: stale "no y-axis labels" and "no independent reviewer" lines removed; Open described as icon-only | parent (unnumbered) | `NOTES.md` |

## New render assertions
- 4j list rows at rest: trailing content within 8px of the row's content edge. Negative control (r3 reserved slots) on Actions run 43030546406 → 4 failed states (all `ticket-resources`); r4 passes.
- 4c+: caret x ≥ right edge of the cell's value.
- Paper Mono loaded (row 9).

## Checks
- `check.py` OK.
- Render on GitHub Actions run 43047432234 (head 93133a269, Playwright container): **30/30 states · 0 failed assertions**. CI-generated HTML byte-identical to the package HTML. The CI job now runs in `mcr.microsoft.com/playwright/python:v1.49.1-noble` (the runner's apt mirrors failed twice), with `bash` pipefail so a render crash behind `| tee` fails the job.
- Rendering environment changed from run 43030342039 (runner + apt Chromium) to the container: 10 PNGs differ from that run; `ticket-resources--list` is the only intended change (row 11).

## Manifest scope
15 files: r3's 16 minus `src/render.sh` (deleted, row 12).

## Noted, not changed
- Vision reads light-theme Mixing `#004a5e` as slate; it is OPUS's recipe and clears the pairwise floor (0.104 from gray). Reviewers judge.
- Hover × glyph ends ~5px inside the chip edge (icon-button padding). Polish.

## Deferred (carried)
- OPUS S6 phone prev/next, S10 primary-field lock + Fields search (implementation plan).
