# 255 — Codex git-guard binding

- **Status:** accepted
- **Date:** 2026-07-20
- **Design:** docs/design/native-codex-binding.md · **Supersedes/Refines:** Contrasts ADR-243 (copilot git-guard, ext-diff advisory); applies ADR-223 (predicate re-expressed per binding)

## Context

This is the highest-risk fork of the binding. Row 12 is proven live: a `command` handler exiting **code 2** with a reason on **stderr** blocks the call — the probe command never ran, and the denial was fed back to the model on the next turn. Copilot's `preToolUse` hook fires but cannot deny (ADR-243), which forced its ext-diff rule to ship advisory. Codex is materially stronger. But `.rules` (execpolicy) is bypassed by interposed global options (`git -C . push`, `git --git-dir=… push`, `bash -lc '…'` all NO MATCH, row 13a) and may fail **open** on a malformed file at runtime (row 13b, unresolved). Row 14a (per-sandbox-mode blocking) was not measured.

## Options considered

1. **Hook enforces** (ext-diff + containment via the shared `toolCallGuard`, exit 2) **+ a codex-local destructive-git matcher composed alongside it** + `.rules` as defence-in-depth + sandbox mode selected but claiming nothing *(chosen)* — pros: the strongest layer available carries the ext-diff rule and destructive-git; `.rules`'s known bypass and fail-open risk are demoted to defence-in-depth rather than the sole line of defence. Cons: the write-tool path-containment branch cannot activate until row 12c's tool-name map is pinned.
2. **Hook enforces the shared predicate only; destructive-git left entirely to `.rules`** — cons: leaves destructive git protected only by a layer that is bypassable (row 13a) *and* possibly fail-open (row 13b).
3. **Hook enforces + destructive-git added by extending the shared predicate in `gate.js`** — cons: changes pi/opencode/copilot behaviour; this belongs to ADR-256's scope, not this one.

## Decision

*Adopted as recommended (no user judgment).* Option 1. **Headline: because Codex's hook genuinely denies, the git-ext-diff rule ships ENFORCED — copilot's ADR-243 advisory carve-out does NOT carry over.**

| Layer | Mechanism | Enforcing? |
|---|---|---|
| PreToolUse hook | `hooks.json` → `hooks/craft-guard.js` → shared `toolCallGuard`; exit 2 + stderr reason | **Yes — live-proven, denial fed back to the model** (ext-diff; containment pending row 12c) |
| Execpolicy `.rules` | `prefix_rule(pattern=["git", [...]], decision="forbidden")` | Partially — token-prefix over argv, defence-in-depth |
| Sandbox | `-s workspace-write` + `writable_roots` + `network_access` | Unmeasured — claims nothing |

Four statements ship verbatim, not softened: (a) `git -C . push` and `git --git-dir=.git push` **bypass** the execpolicy layer — proven live, same gap class as copilot; (b) a malformed `.rules` file **may fail open** at runtime — unresolved, treated as fail-open until proven otherwise; (c) per-sandbox-mode blocking was **not measured**; (d) hook enforcement costs `--dangerously-bypass-hook-trust`, which emits a visible warning every run. Row 12c is a hard prerequisite: Codex's write/edit tool names are unpinned, and an unmapped name fails **open** through the predicate's pass-through tail — the map must be read off a live request body under the BYOK harness before the adapter is authored, or path containment through this layer is decorative.

## Consequences

- `docs/adapters/gate.md` and `adapters/codex/README.md` state all four caveats verbatim — an honest carve-out beats a fake guarantee.
- Until row 12c is pinned, the honest position is: ext-diff is enforced (rides on the pinned `exec_command`); write-path containment leans on the unmeasured sandbox and must not be claimed as enforced.
- The event adapter bridges the field the tool actually executes on unconditionally (never `inspected ?? executed`) and maps only tool names the shared predicate branches on, null-prototype and frozen.
