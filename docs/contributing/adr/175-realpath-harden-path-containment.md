# 175 — realpath-harden path-containment helpers, fail-closed on escape

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/clear-backlog-candidates-gated.md

## Context

Two symmetric helpers contain a path under a fixed root by lexical check only
(`resolve()` + `startsWith(root + sep)`): `containUserPolicyPath` (`engine/src/policy.js`,
user-policy file) and `resolveStorePath` (`engine/src/memory.js`, memory store). A symlink
planted inside the root is followed — not a privilege escalation (both roots are fixed and a
planter could write the target directly), but the helpers advertise containment they do not
enforce.

## Options considered

- (a) Fail-closed — `realpathSync` then re-check containment; return `null` on escape.
- (b) Warn-and-proceed — log, still return the path.
- (c) Split read (warn) vs write (fail-closed).

## Decision

(a) fail-closed, hardening **both helpers together** (they are deliberately symmetric). Return
`null` on a symlink escape, matching the existing null-on-escape contract and the fail-loud
direction. A factored `engine/src/contain.js` carries the shared realpath-then-contain logic so
the two call sites cannot drift.

Non-existent-leaf nuance: `realpathSync` throws `ENOENT` when the target does not exist yet
(the store file is created on first save). The helper realpaths the **deepest existing
ancestor** and re-checks containment of the resolved-ancestor + remaining lexical tail, so a
not-yet-created store under a real directory still resolves while a symlinked ancestor is
caught.

## Consequences

- New `engine/src/contain.js`; `policy.js` and `memory.js` call it. Behavior unchanged for the
  in-root non-symlink case (every existing test stays green); the new branch returns `null`
  only on an escaping symlink.
- Security-review cluster with the memory-hardening change (both touch `memory.js`).
