---
phases:
  workspace:
    context: ~
  validation:
    strategy: incremental
  documentation:
    non-blocking-jobs: 2
models: { harness-triager: sonnet }
pipeline:
  skip: [decisions]
---

# New phase names fixture
