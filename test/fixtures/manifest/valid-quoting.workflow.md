---
paths: { repo: "https://host:8080/org/repo", notes: "# not a comment" }
gates:
  phase: "make test && make lint"
  slice: "npm run build:check"
phases:
  design:
    strategy: incremental
---

# Quoting regression
