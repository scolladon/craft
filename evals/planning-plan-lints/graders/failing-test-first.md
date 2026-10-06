---
type: llm
focus: {source: file, path: docs/plan/shout-flag.md}
arm: both
---
Before any step that changes greet.sh, the plan has a step that adds a test expected to fail against the current greet.sh. Tests added after that change do not fail this.
