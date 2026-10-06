---
type: llm
focus: {source: file, path: docs/plan/shout-flag.md}
arm: both
---
Every part of the plan names a failing test before it changes greet.sh. Each part carries Context, TDD steps, Gate and Commit sections. No part touches a file the design does not name (greet.sh, test/greet.test.sh).
