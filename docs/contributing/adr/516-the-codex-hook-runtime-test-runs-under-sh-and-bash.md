---
subjects:
  - adapters/codex/test/config.test.js
---
# 516 — The codex hook runtime test runs the registered command under sh and bash

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/codex-hooks-quote-plugin-root.md · **Supersedes/Refines:** refines ADR-508

## Context

ADR-508's consequence: a validator run is not proof, so a runtime test executes each registered command from a root containing a space. codex runs hooks under the login shell. sh and bash split the unquoted form (node exits 1), zsh never splits.

## Options considered

1. **sh and bash** *(recommended)* — pros: both exist on every CI image and dev box; each is red on its own against the unquoted form; bash is the Linux login shell that broke / cons: none observed
2. **sh, bash, plus zsh when installed** — pros: covers the macOS default / cons: zsh passes both forms, so it catches nothing; a conditional skip sometimes says nothing
3. **sh only** — pros: one case / cons: on macOS `/bin/sh` is bash in sh mode, on Ubuntu it is dash; bash itself goes untested on Linux

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** The test runs the `hooks.json` command and the decoded template command under `sh -c` and `bash -c`, from a root containing a space supplied through `CLAUDE_PLUGIN_ROOT` and through `CRAFT_ROOT`, with a blocking payload on stdin, and asserts exit 2 with the guard's `--no-ext-diff` reason.

## Consequences

Exit 2 with the guard's reason can only come from the guard itself, so a split path (exit 1) is always red.
