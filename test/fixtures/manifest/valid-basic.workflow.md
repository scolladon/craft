---
backlog: my-backlog
paths: { repo: https://example.com }
context: ~
gates:
  slice: cargo test
  phase: npm test
  review-batch: make ci
pr: { creator: auto }
models: { fallback: sonnet }
phases:
  branch:
    context: ~
  design:
    strategy: incremental
  docs:
    non-blocking-jobs: 2
---

# Workflow

This is the body.
