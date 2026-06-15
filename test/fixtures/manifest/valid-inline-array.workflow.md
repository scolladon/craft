---
gates: { phase: "a && b", review-batch: [x, y, z] }
scripts: { post-setup: [manifest/stubs/a.md, manifest/stubs/b.md] }
phases:
  review: { context: [manifest/stubs/a.md, manifest/stubs/b.md] }
---

# Inline array comma-protection regression

The comma-bearing arrays route through `check_file_ref` (top-level `scripts`
and the inline phase map), so a broken comma-protection split turns the
referenced stubs into dangling paths and flips the verdict to invalid.
