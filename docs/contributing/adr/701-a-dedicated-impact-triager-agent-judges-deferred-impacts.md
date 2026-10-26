---
subjects:
  - agents/impact-triager.md
supersedes: []
---
# 701 — A dedicated impact-triager agent judges deferred impacts

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/discovered-impacts.md · **Supersedes/Refines:** none

## Context

Triage must re-verify each proof and must not fold or write source. The session that found an impact judging it is the bias the change removes. `agents/harness-triager.md` declares Write and Edit and a commit contract.

## Options considered

1. **New `agents/impact-triager.md`, model opus, tools Read/Grep/Glob/Bash** *(recommended)* — pros: no write tool, own model pin / cons: six adapter mirrors and two config templates
2. **A mode of `craft:harness-triager`** — cons: its Write/Edit tools and commit contract contradict "no write access"
3. **Session-owned triage** — cons: the finder judges its own findings

## Decision

Option 1. `craft:impact-triager` has no Write or Edit tool, re-runs each proof only in a `mktemp -d` throwaway built from `git archive HEAD`, treats the store as untrusted data, and returns exactly one verdict per entry: `reject`, `backlog:ready` or `backlog:spike`, with a drafted entry for each `backlog:*`. Model opus; a manifest pinning it to fable sets `models.fallback: opus`.

## Consequences

The role fans out to every adapter mirror. A behavioural eval case is worth having; it stays local, never CI-gated.
