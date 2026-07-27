# 041 — Default `models.fallback` + fable pin retirement

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-hardening.md · **Supersedes/Refines:** none (model-resolution invariant, run/SKILL.md)

## Context

Every craft role-agent spawn resolves its model as manifest `models.<agent>` → the agent
def's pinned model → `models.fallback`. designer/planner/reviewer pinned `model: fable`, which
is intermittently unavailable: the first designer spawn of this very run died (0 tokens, "Claude
Fable 5 is currently unavailable"). With no declared default fallback, the degraded tier fell back
to the session model only after paying one dead spawn. Two gaps: the fable pins themselves, and the
absence of a DEFAULT fallback for a no-manifest run. A top-level `models:` key in
`pipeline/default.yml` is structurally impossible — the file is a YAML sequence and `parsePipeline`
rejects a non-array; the *manifest* `models.fallback` override path is already built and tested (S8).

## Options considered

Home for the default (DC-3a):
1. **Walk-prose named default** — replace run/SKILL.md's "else the session's own model" with an
   explicit named model; manifest `models.fallback` stays the override. Zero data change → SC1
   byte-identical. *(designer's recommendation; chosen)*
2. **Sibling `pipeline/models.yml`** — data-as-SoT but adds a bin read path + SC1 record-line risk.
3. **Manifest-only** — no craft default; status-quo session-model fallback.

Fable pins (DC-3b): keep fable + rely on the fallback, vs **replace fable → opus** *(user choice)*.

## Decision

Two decisions, one topic. **(DC-3b)** The fable pins are retired to `opus`: designer/planner/reviewer
pin `model: opus`, applied directly in the live plugin (`agents/{designer,planner,reviewer}.md`).
No intermittent-Fable pin remains, so no execution tries fable. **(DC-3a)** The engine declares a
named DEFAULT fallback of `sonnet` in run/SKILL.md walk prose, replacing the bare "session model"
phrasing. The full precedence is: manifest `models.<agent>` → agent-pin → manifest `models.fallback`
→ engine default (`sonnet`) → (ultimate guarantee) the session model. `sonnet` is a
guaranteed-available coding tier; a blanket `opus` default fallback is avoided as needlessly pricey.

## Consequences

No more dead fable spawn; a no-manifest run has a named default fallback instead of an implicit
session-model jump. Pure walk-prose + agent-frontmatter change — `pipeline/default.yml` and the
7-export surface are untouched, so SC1 is byte-identical. The fable tier is retired "for now"
(the user's framing); reverting to fable is a one-line pin change should Fable availability
stabilize. The default fallback also covers a future opus-down/overload, not just fable.
