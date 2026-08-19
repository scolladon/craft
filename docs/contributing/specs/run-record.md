---
subjects:
  - skills/run/SKILL.md
---
# The run-record ledger

## File shape and header

One append-only markdown file at `.claude/craft-run-record.md`, rooted at the root of the
tree the run is working in — never `${CLAUDE_PLUGIN_ROOT}`.

That tree changes exactly once per run, so the root is stated per write point rather than
once for the file. `workspace` creates the worktree; lines produced **before** it are
buffered in-session and flushed into the **worktree** ledger at `workspace`, and every
later write goes to the worktree root. Nothing is ever written to the pre-worktree
checkout: an untracked ledger left there would outlive the run, accumulate across runs,
and split one run's record across two files. Under `workspace: { strategy: in-place }`
there is no second tree, so the checkout root is the only root and the file opens at
resolve time. `skills/run/SKILL.md` §0 step 4 is the binding statement of this rule.

A header line opens the file when it is absent:

```
# craft run record (append-only)
```

Every subsequent line is one record, space-delimited, prefixed by the run-id:

```
orchestrator-tax-hardening resolve auto-skip: requirements — evaluated unnecessary (brief is a spec)
orchestrator-tax-hardening design GATE(design): green
orchestrator-tax-hardening validation INTENTION-DRIFT(intention): engine/src/glob.js
```

**One record is one line** — a multi-line no-op justification folds to one line before it
is appended. See Token vocabulary below for the tokens this file adds; this file otherwise
only narrows where tokens land.

## Field shape

Field 1 is the run-id: the kebab-case topic slug already derived at `skills/run/SKILL.md`
§0 step 3, and already the `.claude/craft-metrics.md` key — re-derivable from the same
brief with no extra state. Field 2 is the emitting phase: some tokens carry their own
phase (`GATE(<phase>)`, `NO-OP(<phase>)`) and some do not (`auto-skip:`, `WAIVER:`,
`INTENTION-DRIFT(<page>)`), so this column is what makes every line uniformly
attributable regardless of which token family produced it.

**Path and secret discipline.** The ledger is run-local, but it is the derivation source
for the memory delta, and the memory store IS committed. A line that would become a store
entry carries the store's guardrails already: paths recorded repo-RELATIVE, never
absolute (an absolute path leaks `$HOME` and the username into a committed file), and any
command recorded BARE, with a leading env or secret assignment prefix stripped. See
`docs/contributing/specs/memory.md`; the scrub is the producer's obligation at both hops,
since `save` performs no validation on the write path.

## Token vocabulary

Three fixed, greppable tokens join the existing run-record family (`NO-OP(<phase>):`,
`GATE(<phase>):`, `auto-skip:`, `WAIVER:`, `POLICY(...)`, `INTENTION-DRIFT(<page>):`,
`INTENTION-WAIVE(<page>):`, `STUB-FOUND(<file>):`, `STUB-WAIVE(<file>):`,
`SLOP-FOUND(<file>):`, `SLOP-WAIVE(<file>):`):

- `DECISION-REVERSAL(ADR-NNN): <what changed> -> ADR-MMM` — `NNN` is the superseded
  target, `MMM` the superseding ADR, `<what changed>` is the `scope` string from the
  strict `supersedes` declaration verbatim, so the token and the ADR cannot disagree.
  Emitted by the `decisions` phase, one line per `supersedes` entry authored that run.
  The scope string folds to one line before it is appended (the one-record-one-line
  rule). The token is greppable, never parsed — nothing splits on the ` -> `, so a `->`
  inside a scope string is a cosmetic wart, not an ambiguity. A refinement emits
  nothing — only a reversal is a reversal. A supersession authored outside a craft run
  emits no token at all; that is why `adr-lint` and this token are separate mechanisms,
  and neither substitutes for the other.
- `DECISION-CITE-WAIVE(<file>): <reason>` — the `adr-lint` C3 live-tier-citation waiver,
  collected from `--waiver-source` files (the design doc and the PR body), exactly as
  for `STUB-WAIVE` and `INTENTION-WAIVE`. It belongs to the `ci.sh` hygiene cadence
  family, not to a phase procedure. `DECISION-CITE-FOUND(<file>):` is **not** a
  run-record token and never appears here — under the hard-blocking lint posture a
  finding stops `ci.sh` and there is no run to fold it into; it is the lint's stdout
  format only.
- `MEMORY-RETRACT(<concern>): <merge-key>` — emitted by the phase that owns a concern's
  write surface, on a mechanical re-check that disproves a stored entry (never a
  judgment call). Derived at `skills/integrate/SKILL.md` step 3 into
  `{ concern, payload, retract: true }`. It inherits the ledger's path/secret scrub
  unmodified.

  **On-ledger rendering.** `keyOf` (`engine/src/observability/memory.js`) joins a
  concern's key fields with `\x00`, which cannot travel on a ledger line, so the
  rendering has to be chosen explicitly rather than left to infer. For the `findings`
  concern the key fields are `file` + `pattern` (`KEY_FIELDS.findings`): the payload is
  the merge key split on the first run of whitespace, the first field is `file`
  (repo-RELATIVE, matching every other ledger path), the remainder is `pattern`. This
  rendering is well-defined only because a repo-relative path in this repo carries no
  whitespace; it is not a total rendering — a consumer whose paths do contain whitespace
  would need a different scheme, and any future concern's merge key must state its own
  rendering rather than assume this split.

## The absent-file case

When the ledger does not exist at the point it is opened — `workspace`, once the tree
the run works in exists — the header line is appended first, then the buffered
pre-worktree lines (the seeded `Resolution.record[]` entries from §1c), in order.

## The present-file case

When the ledger already exists (a resume, or a second run in the same worktree), no
header is re-written; new lines are appended (`>>` semantics) after whatever is already
there.

## The three write points and the single-writer rule

Three write points, all orchestrator-owned:

1. **`skills/run/SKILL.md` §0 step 4 (open), realized at `workspace`.** §0 buffers the
   seeded `Resolution.record[]` lines in-session; at `workspace`, once the tree exists,
   append the header if absent and flush those buffered lines into the worktree ledger.
   Under the in-place strategy there is no second tree and the open happens at §0.
2. **`skills/run/SKILL.md` Phase walk step 7 (record outcome).** Append this phase's
   lines to the ledger before moving to the next descriptor — the phase-boundary flush.
3. **`skills/run/SKILL.md` §Done.** Flush any residual lines, if the worktree still
   exists.

**R4 — one writer.** Only the orchestrator appends to the ledger. No role agent writes
it, in any phase, including phases that run in parallel with another (e.g.
`documentation` alongside a background executing-harness).

## Lifetime — run-local, not committed

The ledger is gitignored by the existing `.claude/*` rule — it is not one of the three
re-included names (`craft-memory.md`, `craft-metrics.md`, `workflow.md`). No `.gitignore`
change ships for it, in this part or any other (ADR-301).

The ledger survives a context reset for exactly as long as the worktree does. It does not
survive `scripts/worktree-teardown.sh` (the `integrate` phase's step 3), which removes
the tree and the ledger inside it. **R1 is durability against context loss, never
against worktree loss** — a run whose tree has been torn down is back to having nothing
to read.

## Derivation precedes teardown

`Done` runs after the whole phase walk, and the walk's last phase (`integrate`) is the
one that tears the worktree down. By the time `Done`'s own step runs, if teardown ran,
the ledger file is already gone. The memory `delta`
(`docs/contributing/adr/303-memory-delta-derives-from-the-ledger.md`) is therefore
derived — read — from the ledger's run-id lines at the last point the worktree is still
alive, i.e. before `integrate` invokes `worktree-teardown.sh`; `skills/integrate/SKILL.md`
step 3 carries the matching pointer. The memory **save** itself stays exactly one atomic
call at `Done`, unweakened (R3) — query and command separate; the read moves earlier, the
write does not.

Two live cases at `Done`:

- **Teardown did not run** (the run stopped at `propose`, or `teardown` was declined).
  The tree is alive, the residual flush lands, and the ledger holds the whole run.
- **Teardown ran.** The ledger's on-disk tail is the last phase boundary before it. The
  `integrate` outcome line, and anything `Done` appends, exist in-session only — where
  they already ship, in the final summary and the PR body.

## Failure posture

A failed ledger append is surfaced to the user in-session and the run continues; it is
**not** recorded into the ledger itself (that would be circular). Same posture as a
failed `save` (ADR-120): a write failure never blocks delivery work.

## Inherited edges

**Run-id collision.** The run-id is the topic slug, so a genuine re-run of the same
feature reuses it; a resume then reads the earlier run's lines as its own. This is
inherited, not introduced — `.claude/craft-metrics.md` already keys on the same slug and
already carries repeat records for one id. The run-local ruling narrows it further: it
can only bite when one worktree hosts two runs of the same topic, since a fresh tree
starts empty.

**Resume double-`Done`.** A run that reaches `Done` twice (once before a reset, once
after) calls `save` twice. This is convergent, not corrupting: `save` decay-merges
against the run-start `MemoryView` and entries are advisory, so the second call
reconciles to the same result rather than compounding.

## Ledger vs. store

| Property | Ledger (`.claude/craft-run-record.md`) | Store (`.claude/craft-memory.md`) |
|---|---|---|
| Lifetime | run-local, gitignored, dies with the worktree | committed, travels with the repo |
| Write cadence | incremental, once per phase boundary | buffered all run, flushed once at `Done` |
| Write mode | append-only, never rewritten | whole-file temp-write + rename |
| Decay / eviction | none — history is the point | decay-merged, size-capped |
| Failure posture | warning in-session, run continues | recorded warning, never a blocker |
| Concurrency | single writer; one run per worktree | no locking, last-flush-wins |

The two never touch: the ledger flush never calls `save`, and `save` never writes the
ledger file. The one directional link that does exist — the delta derivation reading
ledger lines and handing `save` a value — is deliberate and one-way.
