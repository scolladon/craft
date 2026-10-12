---
subjects:
  - SECURITY.md
  - .github/ISSUE_TEMPLATE/
---
# 504 — Security reports start with a detail-free public issue

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/public-front-door-completion.md · **Supersedes/Refines:** none

## Context

SECURITY.md needs a reporting channel. GitHub private vulnerability reporting is disabled on the repo today, and publishing a maintainer email address is a personal choice.

## Options considered

1. **GitHub private vulnerability reporting** *(recommended)* — pros: private, no published address / cons: needs the repo setting enabled before merge
2. **A maintainer email address** — pros: works today / cons: publishes an address
3. **A public issue asking for a private contact, with no vulnerability details** — pros: no setting, no published address / cons: an extra round trip before details flow

## Decision

Option 3 — ratified by the user (deviates from the recommendation). SECURITY.md tells reporters to open a public issue that asks for a private contact and contains no vulnerability details; the maintainer then supplies a private channel. No repo setting change is a precondition of merging.

## Consequences

SECURITY.md must state the no-details rule prominently. The issue-form `config.yml` security contact link points at SECURITY.md. Switching to private reporting later is a SECURITY.md edit.
