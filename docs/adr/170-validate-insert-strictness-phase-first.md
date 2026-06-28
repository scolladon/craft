# 170 — `validateInsert` strictness: phase-first message, then require `id`, allow unknown keys

- **Status:** accepted
- **Date:** 2026-06-27
- **Design:** docs/DESIGN-nested-insert-fail-loud.md · **Refines:** 169

## Context

Given ADR-169 (reject the nested shape at lint), `validateInsert` needs a strictness model
and an error-message shape. The nested entry's `id` lives *inside* `phase:`, so a naive
"missing id" complaint would mislead the author.

## Options considered

- (i) Require a top-level string `id` only — the nested entry fails via "missing id" (a
  confusing message: the id is hidden inside `phase:`).
- (ii) Detect the `phase:` marker first and emit a targeted "use the flat shape" message
  (skip the id check for that entry), then require a non-empty string `id`, allow other keys.
- (iii) Require `id` + a strict unknown-key whitelist for insert entries.

## Decision

(ii). Per entry: if the entry owns a `phase` key, push the nested-shape rejection naming the
entry and pointing at the flat shape `{ after|before, id, procedure, … }`, then `continue`
(skip the id check for that entry — the flat-shape pointer already tells the author what to
do). Otherwise require a non-empty string `id`. Other keys are allowed. Errors accumulate
across entries; the only per-entry early-`continue`s are the malformed-entry and nested-entry
cases — no global short-circuit, no throw (mirrors `validateReorder`/`validateTechnique`).

## Consequences

- Best pedagogy: names the nested marker and teaches the flat shape, no double "missing id".
- Forward-compatible: `gate`/`harness`/`role`/`model` are recent insert fields; a strict
  whitelist (iii) would need perpetual maintenance — `validateTechnique` already chose
  forward-compat. (i) keeps the message confusing for the common (nested) case.
- An entry label helper resolves `id` → else `after:`/`before:` anchor → else index, so the
  nested case (no top-level `id`) still labels meaningfully.
