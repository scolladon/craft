---
subjects:
  - greet.sh
---
# 002 — --quiet applies on a pipe too

- **Status:** accepted
- **Date:** 2026-02-03
- **Design:** none · **Supersedes/Refines:** none

## Context

greet.sh offers a --quiet flag. Callers pipe its output into other tools and expect the flag
to behave the same there as on a terminal.

## Options considered

1. **--quiet suppresses output on a terminal and on a pipe alike** — one predictable behaviour / a caller wanting pipe output needs another flag. (recommended)
2. **--quiet only applies on a terminal** — pipes keep their output / the flag behaves differently by context.

## Decision

--quiet suppresses output on a terminal and on a pipe alike. A caller that needs pipe-specific output passes a separate flag.

## Consequences

- No greet.sh flag branches on whether stdout is a terminal.
