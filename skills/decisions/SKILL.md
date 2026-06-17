---
name: decisions
description: Craft phase 3 - the user decides every load-bearing design choice; decisions are captured as ADRs; deviations fold back into the design.
---

# craft:decisions

## Preamble (always runs — non-overridable)

1. Manifest read (lint if standalone). Probe: ADR directory (`paths.adr`, else
   `docs/adr/`, create if absent); repo ADR template, else
   `"${CLAUDE_PLUGIN_ROOT}/templates/adr.md"`; next ADR number = highest existing + 1.

## Procedure (default body — a manifest `override:` replaces everything below)

ENTIRELY session-owned — never delegated.

1. No decision candidates from design? Skip honestly (run record: "no user-judgment
   decisions") — never invent questions.
2. Per candidate: present ≤3 options with the design's recommendation; capture the
   user's decision as `<adr-dir>/NNN-<title>.md` from the template; commit each as
   `docs(adr): NNN <title>`.
3. **Scope-fold rule:** if any decision deviates from the design's recommendation,
   spawn a FRESH **craft:designer** to revise — fed the ADR + design-doc PATHS (the
   committed artifacts, read in-place; never your conversation) — committing
   `docs(design): revise <slug> against ADRs <range>` BEFORE the planning phase.
