---
type: regex
target: last_message
match: not_contains
flags: m
arm: with-only
---
^[\s>*`#|\d.)-]*PRUNE-CANDIDATE\([^)]*core\.md
