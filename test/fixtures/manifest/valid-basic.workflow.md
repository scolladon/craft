---
backlog: { source: file, ref: manifest/stubs/a.md }
paths: { repo: https://example.com }
context: ~
gates:
  part: cargo test
  phase: npm test
  review-batch: make ci
pr: { creator: auto }
scripts: { post-setup: ~ }
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
