# 317 — A `modified` hook re-trusts automatically, gated on the hook command's identity

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/codex-0145-limitation-reprobe.md · **Supersedes/Refines:** none

## Context

`hooks/list` reports `trustStatus ∈ { managed, untrusted, trusted, modified }`. `modified` is what
codex's vocabulary denotes for a hook trusted once whose definition has since changed.

What `currentHash` covers was probed from both sides, so it is an observation rather than an
inference:

- Editing the hook's `command` while leaving the guard script alone **changed** `currentHash`.
- Changing the guard script's contents while leaving the `command` byte-identical left
  `currentHash` **unchanged** —
  `sha256:8ef60908ec109ac294eee8de7e3accf796e5f4b28302703f5ae99cda5c6ab782` before and after.

The hash therefore covers the hook **definition** in `config.toml`, and the guard script's contents
are outside it. That bounds what any re-trust policy can promise, and the bound is unflattering:
an attacker who can rewrite `craft-guard.js` moves no hash, never produces a `modified` status, and
is not defended against by this decision or by codex's trust gate. Trust is anchored to the hook
definition, never to the guard's behaviour. Re-trusting a `modified` hook neither creates that
exposure nor closes it.

## Options considered

1. **Automatic, after verifying the hook's `command` still runs craft's own guard script** *(recommended)* — pros: the realistic cause of `modified` is craft updating its own `hooks.json`, so upgrades stay frictionless; the command check runs first, and it is anchored rather than a containment test — the command must be an interpreter plus the guard as its operand / cons: a craft-authored definition change regains trust without a human looking at it, and the check cannot speak to what the guard script now contains.
2. **Require an explicit `--retrust` flag** — pros: a human is in the loop on every definition change / cons: costs a flag and a README line, and puts that human in the loop mostly for craft's own upgrades.
3. **Refuse and tell the operator to re-trust interactively** — pros: strictest / cons: interactive trust is the exact thing this change exists to escape.

## Decision

**Ratified by the user, as recommended.** `modified` re-trusts automatically, and only after the
helper has confirmed the hook's command runs craft's own guard script as its operand.

## Consequences

The command-identity check is load-bearing, not cosmetic — and its reach is bounded in both
directions, stated here rather than assumed away.

**What it establishes.** The hook's `command` is exactly two whitespace-separated tokens, the
first's basename is `node`, and the second — the operand the interpreter actually runs — ends in
`/adapters/codex/hooks/craft-guard.js`; a `project`-sourced hook is refused outright, since a
repository-supplied hook is the thing codex's trust gate exists to stop. Five decoy commands
carrying that same tail were checked and all refused: the tail in a trailing comment, in a quoted
argument, as a flag value, on a `.bak` lookalike, and behind a traversal path. A containment test
would have trusted every one of them.

**What it cannot establish.** That the script sitting at that path is craft's. The guard script's
contents are outside `currentHash` (above), so a rewritten `craft-guard.js` presents identically to
the original. The check anchors the hook definition; it does not attest the guard's behaviour, and
no claim that a foreign guard is thereby excluded is supportable.

It must match both the raw `node ${CRAFT_ROOT:-…}/adapters/codex/hooks/craft-guard.js` form and a
fully shell-expanded absolute form. One live observation reported the command shell-expanded; the
raw form was never observed either way, so a single observation cannot license dropping either
variant. Both get a unit test; matching only the variant the author imagined is the same
unit-green/live-broken failure this binding already paid for once.
