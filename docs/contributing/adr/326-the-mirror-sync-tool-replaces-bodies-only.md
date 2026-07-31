# 326 — The adapter mirror sync tool replaces bodies only, and checks by default

- **Status:** accepted
- **Date:** 2026-07-31
- **Design:** docs/contributing/design/scheduled-backlog-sweep.md · **Supersedes/Refines:** none

## Context

Six adapters mirror the nine shared `agents/*.md` bodies — 54 files. Five of them
(copilot, codex, cursor, antigravity, opencode) keep their own frontmatter above the shared body;
aider is body-only with no fence at all and leading blank lines stripped. The drift guards are
byte-identity tests, so every shared-agent edit is six manual syncs discovered one red suite at a
time.

A frontmatter survey decided the tool's shape. Keys are uniform *per adapter* but values vary *per
role*: codex varies model and effort, copilot varies effort, and opencode carries a nested 10-key
`permission` map taking three distinct shapes across the nine roles.

The tool exists to prevent silent mirror corruption, so the aider variant is the trap it must not
fall into: write a frontmatter fence there, or fail to strip the leading newlines, and the tool
corrupts a mirror in exactly the way it was built to prevent.

## Options considered

1. **`scripts/sync-adapter-agents.sh` with `--check` as the default read-only mode and an explicit `--write`, replacing body only and preserving each mirror's existing frontmatter byte-for-byte** *(recommended)* — pros: needs zero frontmatter schema knowledge — split at the line-exact `---` fences, take the body, strip leading newlines, and for aider write the body alone / cons: adding a tenth role still means hand-writing six frontmatter blocks.
2. **Check-only — no writer** — pros: CI names every drifted mirror at once instead of one red suite at a time / cons: removes the discovery tax but not the edit tax, and the edit tax is the larger half.
3. **A writer that regenerates frontmatter from a declared per-adapter table** — pros: a new role needs one table entry rather than six files / cons: must encode five dialects plus opencode's per-role permission matrix, and a bug there corrupts a mirror in the exact way the tool exists to prevent — to save a cost paid roughly never.

## Decision

**Ratified by the user.** The tool ships as `scripts/sync-adapter-agents.sh`, read-only `--check` by
default, writing only under an explicit `--write`, and replacing the body only. Existing frontmatter
survives byte-for-byte.

The rule for future work: this tool never generates frontmatter. Adding a role means hand-writing
its per-adapter frontmatter once; the tool then owns the body forever after. The read-only mode runs
in `scripts/ci.sh`.

## Consequences

The six per-adapter byte-identity guards stay, with their own independent implementations. The tool
must never be the only thing checking itself — a shared implementation between tool and guard would
make a bug in the extraction rule invisible to both. opencode's missing byte-identity assertion is
added in the same part that introduces the tool, so all six adapters are guarded rather than five.

Default-to-check is what makes the tool safe to run reflexively and safe to wire into CI. A writer
that ran by default would turn a drifted mirror into a silently rewritten one, which is the failure
this whole surface is defending against.

The body-extraction rule is now load-bearing in two places at once: split at the line-exact `---`
fences, take everything after the closing fence, strip leading newlines. Any future change to how
shared agent files are framed has to move the tool and all six guards together.
