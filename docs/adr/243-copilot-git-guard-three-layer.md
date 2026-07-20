# 243 — Copilot git-guard: three layers, two enforcing and one advisory

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-copilot-binding.md · **Supersedes/Refines:** Applies ADR-223 (per-binding event adapter)

## Context

This was the highest-risk fork of the Copilot binding, and the live probe inverted the brief's premise. Copilot **does** expose a `preToolUse` hook, and it **fires** — but it **cannot deny**. Two denial shapes were tested and both failed: `{"permission":"deny","reason":…}` on stdout, and `exit 2`. In both runs `git push --force` executed unimpeded. (A probe accident demonstrated this concretely against a real repo; it was harmless only because that repo has no remote.)

Two *native* mechanisms do enforce, both proven live:
- **Path containment** — an out-of-tree `create` was blocked (target file absent) with only `--allow-all-tools` and no `--allow-all-paths`.
- **`--deny-tool`** — `--deny-tool='shell(git push)'` blocked execution outright (`success=false`, `result=null`, no git output). Copilot's docs state denial rules take precedence over allow rules, **even `--allow-all-tools`**.

So the brief's framing — "if Copilot exposes no tool-call hook, consider declaring the guard unenforceable" — understates what is achievable.

## Options considered

1. **Three layers: native containment + `--deny-tool` (both enforcing), `preToolUse` hook advisory** *(designer recommendation)* — pros: enforcement is strictly stronger than an advisory hook; keeps `gate.js` exercised and single-sourced; yields a free audit trail. Cons: the carve-out must be documented precisely or it reads as a full guard.
2. **`--deny-tool` only** — cons: discards the audit trail; `gate.js` stops being exercised in this binding at all.
3. **Declare the guard wholly unenforceable** — cons: factually understates the binding; two mechanisms demonstrably enforce.

## Decision

**Ratified by the user.** Option 1. The Copilot git-guard binds as three layers:

| Layer | Mechanism | Enforcing? |
|---|---|---|
| Containment | native path verification — pass `--add-dir <worktree>`, **never** `--allow-all-paths` | **yes** |
| Command policy | `--deny-tool` pattern set (`src/deny-tool-args.js`) | **yes** |
| Audit | `preToolUse` → `src/git-guard-adapter.js` → `gate.js` predicate | **no — observational** |

`gate.js`'s predicate is reused **verbatim**; only the event adapter is re-expressed. Per the pinned tool schemas the adapter must: map **lowercase** `toolName` (`bash`→`Bash`, `create`→`Write`, `edit`→`Edit`, and only those the predicate branches on); parse `toolArgs`, which is a **JSON-encoded string**, failing **closed** on a parse error; and bridge the field each tool actually **executes on** (`path` → `file_path` unconditionally — Copilot has no `file_path` field at all, so a `file_path ?? path` preference would let an in-tree decoy mask an out-of-tree `path`).

**The carve-out is explicit and narrow:** for this binding the guard's *ext-diff* rule is **advisory**, because Copilot exposes no denying hook. Containment and destructive-git rules are enforced **natively**.

## Consequences

- The predicate stays single-sourced across all four bindings; only the event shape differs.
- Launch flags become load-bearing: `--add-dir <worktree>` is required and `--allow-all-paths` is forbidden. A test asserts `--allow-all-paths` is never emitted.
- A decoy test is mandatory: in-tree `file_path` + out-of-tree `path` must block.
- The advisory ext-diff carve-out is documented in the POC record and `gate.md`, never implied to be enforcing.
- If Copilot later ships a working deny schema (D5), promoting the audit layer to enforcing is additive.
