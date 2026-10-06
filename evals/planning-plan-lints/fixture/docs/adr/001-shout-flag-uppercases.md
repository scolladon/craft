---
subjects:
  - greet.sh
---
# 001 — The shout flag uppercases the whole greeting with tr

- **Status:** accepted
- **Date:** 2026-01-15
- **Design:** docs/design/shout-flag.md · **Supersedes/Refines:** none

## Context

greet.sh runs on the bash 3.2 that ships with macOS, which lacks case-conversion parameter
expansion.

## Options considered

1. **Pipe the finished greeting through `tr '[:lower:]' '[:upper:]'`** — portable / one extra process. (recommended)
2. **bash 4 `${greeting^^}`** — no extra process / fails on bash 3.2.

## Decision

`--shout` uppercases the whole finished greeting line, name included, by piping it through
`tr '[:lower:]' '[:upper:]'`.

## Consequences

- Non-ASCII letters follow the locale's tr rules.
