---
subjects:
  - greet.sh
---
# 001 — greet.sh stays portable to bash 3.2

- **Status:** accepted
- **Date:** 2026-01-15
- **Design:** none · **Supersedes/Refines:** none

## Context

greet.sh runs on the bash 3.2 that ships with macOS, which lacks bash 4 features such as
case-conversion parameter expansion.

## Options considered

1. **POSIX tools and bash 3.2 syntax only** — runs everywhere / slightly longer code. (recommended)
2. **Require bash 4 or later** — shorter code / breaks on stock macOS.

## Decision

greet.sh uses only bash 3.2 syntax and POSIX tools (tr, printf, sed). No bash 4 expansion.

## Consequences

- Every greet.sh change is reviewed for bash 4 syntax.
