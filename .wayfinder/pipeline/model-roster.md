# Model roster for pipeline stages (docs/agents-pipeline.md)
#
# Dispatch syntax: paseo run --provider "omp/9router/<model-id>"
# Rule: S3 QC model family must differ from the S2 implementer family.
#
# IMPLEMENTATION (S2) — rotate by slice type; sonnet retired (slow/low quality per Rais)
#   cx/gpt-5.6-luna    :max    — primary implementer, big verticals (verified; ocg/ variant flaky-retries)
#   glm/glm-5.3        :max    — implementer, API/backend slices (200K ctx)
#   ocg/ox-alpha-free  :high   — implementer, small scoped slices/rework cycles (free tier)
#   ocg/deepseek-v4-pro :high  — implementer, huge-context work (1M ctx, cheap)
#   cx/gpt-5.3-codex-spark :xhigh — fast rework cycles, narrow defect fixes
#
# SPEC REVIEW (S1) + QC REVIEW (S3) — reviewers
#   cx/gpt-5.6-terra   :xhigh  — primary reviewer (proven: caught 0037 deletion)
#   cx/gpt-5.6-sol     :xhigh  — alternate reviewer
#   ocg/minimax-m3     :high   — alternate reviewer (1M ctx for big diffs)
#   glm/glm-5.3        :max    — reviewer when implementer was GPT-family
#
# PAIRING GUIDE (implementer -> QC):
#   cx/gpt-5.6-luna       -> glm/glm-5.3 or ocg/minimax-m3
#   glm/glm-5.3           -> cx/gpt-5.6-terra
#   ocg/ox-alpha-free     -> cx/gpt-5.6-terra or cx/gpt-5.6-sol
#   ocg/deepseek-v4-pro   -> cx/gpt-5.6-terra
#   cx/gpt-5.3-codex-spark-> glm/glm-5.3 or ocg/minimax-m3
