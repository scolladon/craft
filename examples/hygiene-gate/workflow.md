---
# Injection point (HOW): hygiene.gate — the shared posture knob for ci.sh's two touched-diff lints
# (stub-marker + anti-slop prose). `advisory` prints; `blocking` promotes both together.
hygiene: { gate: blocking }
---

# Example — hygiene lint posture (`hygiene.gate`)

`ci.sh` runs two touched-diff lints on every branch: a stub-marker lint and an anti-slop
prose lint. `hygiene.gate` is the single posture knob shared by both — there is no separate
knob per lint.

| | default (`advisory`) | with this manifest (`blocking`) |
|---|---|---|
| stub-marker lint | findings print, run stays green | findings promoted to a hard stop |
| anti-slop prose lint | findings print, run stays green | findings promoted to a hard stop |

## Fail-closed validation

`hygiene.gate` is validated against the same fixed set as `intention.gate` (`advisory` or
`blocking`) — any other value is a manifest-lint error, not a silent fallback.

## Scope: this sample's own manifest only

This manifest sets `blocking` for **this sample directory**. `ci.sh` resolves the repo-root
`.claude/workflow.md`, which this sample does not touch, so the repo's own CI posture is
unaffected. This file is itself a touched `*.md`, read by the anti-slop lint at whatever
posture the repo root resolves to.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
