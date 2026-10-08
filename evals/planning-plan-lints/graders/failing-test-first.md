---
type: llm
focus: {source: file, path: docs/plan/shout-flag.md}
arm: both
---
Before any step that changes greet.sh, the plan has a step that adds a test expected to fail against the current greet.sh. Steps that add only already-passing tests, before or after that change, neither satisfy nor fail this.
