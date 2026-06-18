---
# Injection point #3 (PRD §7): gates.<cadence> — supply the command the engine runs as a gate.
# Your harness, any tech: the engine owns the *cadence* (never commit on red; phase gate once per
# round), the command is yours. Three cadences: slice, phase, review-batch. All-current.
gates:
  phase: "make ci"
---

# Example — supplying a gate command (`gates`)

A **gate** is the pass/fail check the engine runs at a cadence boundary. craft owns the *discipline*
— never commit on a red gate, never `--no-verify`, a gate *must exist* for code-producing phases
(§11) — but the **command is yours**: any tech, any toolchain. Here the phase-boundary gate is
`make ci`.

| Cadence key | When it runs | This manifest |
|---|---|---|
| `slice` | after each TDD slice | default (probed test command) |
| `phase` | once per phase round | **`make ci`** |
| `review-batch` | after a review fix batch | default |

## The engine owns cadence; you own the command

The Gate **port** only exposes `run(cmd) → pass\|fail`; the *policy* lives in the core: a targeted
gate per fix, the phase gate once per round, and **never commit on red** (enforced mechanically by a
PreToolUse hook, not session memory). Supply a weak command and you weaken your own floor — but you
can never accidentally bypass the discipline: a red `make ci` blocks the commit, full stop.

If no gate is declared, the engine **probes** for one (test script in `package.json`, a `Makefile`
target, etc.); declare `gates` only to pin an exact command.

> In your real repo this file lives at the project root as `.claude/workflow.md`.
