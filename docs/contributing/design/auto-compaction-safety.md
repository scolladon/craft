# Design — auto-compaction-safety

> Brief: make the craft orchestrator and its spawns survive an automatic context compaction at
> any turn, mid-phase included, by putting every piece of run state on disk the moment it exists
> and re-injecting it after the compaction.
> Status: draft → self-reviewed ×3 → revised against ADRs 372-382 (every candidate settled)

## Context

**What compaction does to a run today.** The orchestrator keeps run state in its own context and
flushes it at fixed points. A compaction fires on a token threshold at an API-call boundary,
never at a chosen moment, and the model cannot trigger it (spike A Q1, Q8). Everything below
is lost if it fires at the wrong turn:

| State | Where it lives today | Anchor |
|---|---|---|
| run-record lines before `workspace` | in-session buffer | `skills/run/SKILL.md` §0 step 4 (L143-166) |
| run-record lines after `workspace` | flushed at the phase boundary only (ADR-302's cadence, superseded by ADR-372) | walk step 7 (L307-322); spec "three write points" |
| craft flags (`--config/--profile/--skip/--harness/--policy`) | in-session | §0 step 0a |
| `Resolution`, `awaitingHarnesses` | in-session | §0 steps 1b, 1d (L115-119); Cross-phase invariants (L346) |
| phase-entry time used by `emit-metrics --since` | in-session | `## Done` metrics paragraph |
| per-part `size` + `outcome` | "buffered to run record, flushed at run end" | `skills/implementation/SKILL.md` preamble 3; spike C H5 lost one |
| review `Finding[]` | in-session between normalise and fix | `skills/review/SKILL.md` procedure 2-4 |
| background harness handle | run-lock `<pid> <iso>` only; output/spec paths in-session | `skills/validation/SKILL.md` procedure 1 |
| memory `delta` | in-session from integrate step 3 to `Done`, across teardown | `skills/integrate/SKILL.md` step 3 |

**Existing surfaces this design extends.** One plugin hook today: `hooks/hooks.json` →
`PreToolUse(Bash)` → `hooks/git-no-ext-diff.sh`, called through the `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}`
shim (ADR-217), tested by `test/hooks.test.js` (`runHook(hookName, fixtureName)` over
`test/fixtures/hooks/*.json`) and shellchecked by `scripts/ci.sh` (`shellcheck scripts/*.sh hooks/*.sh`).
The miner's Claude binding (`engine/src/observability/adapters/claude/telemetry.js` `parseLines`)
drops every line without `message.usage`, so a `compact_boundary` is invisible today.

**Binding decisions.** ADR-301 (ledger run-local, gitignored, no `.gitignore` change), ADR-303
(memory delta derives from the ledger), ADR-357/360 (run-record tokens and their vocabulary live
in `docs/contributing/specs/run-record.md`), ADR-372 (ledger appended per line as produced; it
supersedes ADR-302's per-phase-boundary cadence and carries forward its single-writer rule),
ADR-363/371 (metrics bin; transcripts identified by phase and window), ADR-369 (equiv weights are
fixed constants), ADR-361/365 (turn budget is agent-self-counted), ADR-217 (shim), ADR-223 (a hook
predicate is re-expressed per binding — this design ships the Claude binding only). ADR-373 to
ADR-382 settle the candidates below.

**Mechanical constraints found while reading.** `test/craft-root-shim.test.js` pins the exact
count of shimmed invocations per file (`hooks/hooks.json` is `1`, `skills/run/SKILL.md` is `6`),
so every touched file's count moves. `test/living-corpus.test.js` pins the living-corpus set, which
a new `docs/contributing/specs/*.md` page joins. `test/source-hygiene.test.js` class A forbids
technique tool names in `skills/`, `agents/`, `contracts/`, `docs/contributing/specs/`,
`docs/guides/customizing.md` and `README.md`. Tokens and prose must stay technique-neutral.
Inserting a numbered step into `skills/run/SKILL.md` would leave stale `step-N` references
(`skills/design/SKILL.md` and `skills/planning/SKILL.md` cite walk step 4), so nothing is renumbered.

**Gate-less phases (verified).** `node engine/bin/pipeline-resolve.js pipeline/default.yml .claude/workflow.md`
→ `gateDecisions` gives `gate: ""` for `workspace`, `design`, `decisions`, `documentation`, `integrate`.
Walk step 7 emits `GATE(...)` only where a gate ran, and a gated phase can log `red` before `green`.
`GATE`/`NO-OP`/`auto-skip:` therefore cannot tell you which phases are complete. A completion token is required.

## Requirements

- **R1 — flush per line (ADR-372).** From §0 step 4 on, every run-record line is appended in the tool call
  that produces it or in the orchestrator's very next tool call. The phase-boundary flush and the `Done` residual flush
  disappear. The run skill and the run-record spec state the same rule.
- **R2 — pre-workspace lines (ADR-378).** Lines produced between §0 step 4 and `workspace` land in a scratch
  ledger, and `workspace` moves them in order into the worktree ledger within one tool call.
  §0 lines produced before the run-id exists (steps 0b–1e run before step 3 derives the slug) are the
  only in-session buffer left: bounded to §0, and re-derivable by re-running §0.
- **R3 — rebuildable state.** On disk: craft flags, the initial `awaitingHarnesses`, phase entry and
  exit, per-part lines, review `Finding[]` per dimension×cycle, background harness handles,
  the `Done`-bound memory delta.
- **R4 — single writer unchanged (ADR-372, carried forward from ADR-302).** Only the orchestrator's
  own tool calls append to the ledger, foreground or background. The hooks only read.
- **R5 — reorient hook (ADR-373, ADR-376).** A plugin-registered `SessionStart` hook with matcher `compact` prints,
  for the active run bound to this session, a block that opens with the sub-agent guard. It then
  prints the rebuild steps and that run's ledger tail, ≤ 8,000 characters.
- **R6 — silent no-op (ADR-373, ADR-375).** Both compaction hooks exit 0 with empty stdout when cwd
  is not in a git repo, when there is no run directory, when no pointer is bound to the session
  transcript, and when the bound pointer's ledger is gone or unreadable. Every path exits 0, because a
  `PreCompact` exit 2 blocks the compaction (P5). Neither hook writes a file.
- **R7 — derivation is code (ADR-379).** `run-state` derives completed, in-flight and next phases and the
  remaining `awaitingHarnesses` from a ledger plus the `Resolution`. A disagreement between the ledger's
  `AWAITING` line and the re-resolved `Resolution` is a blocker (exit 1), never a guess.
- **R8 — rebuild procedure.** `skills/run/SKILL.md` gains a `## Rebuild after compaction` section:
  trust the ledger over the summary, re-resolve, re-`load()`, re-`consult()`, run `run-state`,
  resume in-flight phases per a resume table, walk from `next`.
- **R9 — estimated compaction cost (ADR-382).** The miner reports per run the number of `compact_boundary`
  entries (main + sub-agent) and an estimated summary-call cost band. The band is labelled
  estimate and is never added to measured groups, totals or cost.
- **R10 — docs (ADR-374).** `docs/guides/customizing.md` recommends `autoCompactWindow: 233000` and how to
  scope it. craft documents the setting and never writes the user's settings.
- **R11 — evidence.** A committed, anonymised `docs/contributing/specs/auto-compaction-poc-record.md`
  records the pinned matrix below.
- **R12 — vocabulary.** Each new token has a fixed, greppable `TOKEN(<param>):` form and is listed
  in the run-record spec. No step is renumbered, and no technique tool name enters a hygiene-scanned surface.
- **R13 — summary-steering hook (ADR-375).** A plugin-registered `PreCompact` hook (auto and manual)
  prints, for the run bound to this session, a summariser note ≤ 2,000 characters (ledger path < 800): what an orchestrator's
  summary keeps (run-id, ledger path, in-flight phase(s), landed commit hashes, any unanswered user
  question), then what a craft sub-agent's summary keeps (spawn task statement, files written, commits landed).

## Design

### Pinned external behaviour

Source: spike A (auto-compaction; CLI 2.1.278, probes on a 200k-window model; threshold read on a
1M-window model), spike B and spike C (headless loop, shelved). These findings are run-local and
gitignored, and their anonymised copy is R11. P1–P3 were pinned while writing this design, P4–P5 in
its revision (manual `/compact` via `claude -p --resume`, Haiku 4.5, mktemp cwd, `--settings` hooks).

| # | Behaviour | Evidence |
|---|---|---|
| Q1 | `E = min(W, window) − min(maxOutput, 20000)`, `T = E − 13000`. Fires only when the window source is not `auto`. The 1M model defaults to `T = 967000`. `W < 100000` is ignored. A change to `W` mid-session is detected but not applied. | debug `effectiveWindow`; fired `preTokens` 1–5% above predicted `T` on 8 boundaries |
| Q2 | Every spawn inherits `W` unchanged, and sub-agents compact between tool calls | 0 main / 3 sub-agent boundaries |
| Q3 | `PreCompact` → summary call → `SessionStart(source=compact)` → `PostCompact`. All three fire on auto compaction and on a **sub-agent's** compaction. The payload is identical to the main session's: same `session_id`, main `transcript_path`, `cwd`, no agent field, no agent env var. | payload dumps |
| Q4 | `SessionStart[compact]` stdout reaches the model (in the sub-agent's context for a sub-agent compaction). `PostCompact` stdout does not. | nonce echoed / absent |
| Q5 | `PreCompact` exit-0 stdout is appended to the summariser's instructions, including in sub-agents | marker in 2/2 summaries |
| Q6 | The summary copies user messages verbatim and re-attaches recently Read files. Facts that came from a tool result: 4 kept / 1 distorted / 1 lost from the summary alone, 6/6 exact with a ledger-reinjecting hook. | scoring table |
| Q7 | The summary call costs 12–21k equiv at 25–67k pre-context and is **absent from the transcript**. `compactMetadata` = `trigger, preTokens, postTokens, cumulativeDroppedTokens, durationMs, preservedMessages, preservedSegment`. | `modelUsage − transcript sum` = the summary calls exactly |
| Q8 | No model-reachable route triggers `/compact` | spike 2 route table |
| C-H3 | Concurrent single-line appends to one ledger both survived | spike C H3 |
| P1 | `git rev-parse --path-format=absolute --git-common-dir` returns the **main** checkout's `.git` from the checkout, from a linked worktree and from a worktree subdirectory. It exits 128 outside a repo. | git 2.55, mktemp throwaway |
| P2 | A Bash call's stdout is stored verbatim in the session transcript as a `type:"user"` line carrying a `tool_result` block (and the command text as a `tool_use` block) | this design session's transcript, CLI 2.1.278 |
| P3 | Boundary line: `type:"system"`, `subtype:"compact_boundary"`, `compactMetadata{…}`, plus `agentId`/`isSidechain` in a sub-agent transcript. The summary is a **separate** later line (+3 in every sample, after `session_context` and `date` attachments): `type:"user"`, `isCompactSummary:true`, `message.content` a string, no `usage`. `chars/4` of that string reproduces spike A's summary-token figures (e.g. 3,380 chars → 845). | 10 boundaries in 7 probe transcripts, keys only |
| P4 | Manual `/compact <text>`: `PreCompact` fires with `trigger:"manual"` and `custom_instructions` = `<text>`. Registrations with matcher `manual`, `""`, `auto\|manual` or no matcher fire; matcher `auto` does not. `SessionStart[compact]` fires too. Hook stdout and the user's text both reach the summary; the boundary's `trigger` is `manual`. With spike A (matcher `""` fired on auto), `""` is pinned on both triggers. | five registrations on one session; marker and user fact in the summary |
| P5 | A `PreCompact` hook exiting 2 **blocks** the compaction (no boundary; CLI prints "Compaction blocked by PreCompact hook"). Exit 1 does not block. | one session per exit code |

**Design principle.** Compaction is checked only before an API call (Q1), so a single tool call is
atomic with respect to it. A fact can be lost only in the gap between the tool result that produces
it and the tool call that persists it, which is one API call. The design shrinks every such window to
that gap or to zero (same-call append). It also makes every fact lost in the gap either
re-derivable (idempotent re-run) or re-producible (respawn from artifact, the existing
"Artifact is the handoff" invariant).

### On-disk layout

> Revised in review (ADR-383): the run directory moved from `<main>/.claude/craft-runs/` to
> `<git-common-dir>/craft-runs/`, where no commit can write; a case-insensitive filesystem
> let a committed case-variant pointer pass the in-tree trust check. The layout below reads
> with that root.

```
<git-common-dir>/craft-runs/              shared by every worktree; never tracked
  <run-id>.pointer    "<run-key> <abs-ledger-path>"   open → move → close (ADR-377)
  <run-id>.pre.md     scratch ledger, worktree strategy only, §0 step 4 → workspace (ADR-378)
  <run-id>.delta.json memory delta, integrate step 3 → Done (ADR-378)
<worktree>/.claude/craft-run-record.md      the ledger — path and line format unchanged
$TMPDIR/craft-review.XXXXXX/<dim>.c<N>.json normalised Finding[] (ADR-381)
```

`<run-key>` = `<run-id>@<UTC ISO-8601 seconds>`, charset `[a-z0-9-]@[0-9TZ:-]`. Nothing in it
needs JSON escaping, so it greps literally in a transcript. With `workspace: { strategy: in-place }`
the pointer names `<main>/.claude/craft-run-record.md` directly and there is no scratch file.
Everything under `.claude/craft-runs/` inherits the ledger's ignore posture (ADR-301). A consumer
repo that does not ignore `.claude/` sees these files untracked during the run, exactly as it sees
the ledger today. This amends the spec rule "nothing is ever written to the pre-worktree checkout".
Its three reasons are answered one by one: the scratch file is *moved*, never split; `close` removes
the run's files; crash residue stays confined to one named directory, and the next `open` sweeps any
pointer whose ledger is gone.

### `scripts/run-ledger.sh` — the one write and locate surface (ADR-380)

| Verb | Effect | Exit |
|---|---|---|
| `open <run-id> [--in-place]` | sweeps stale pointers (ledger file missing), writes header `# craft run record (append-only)` to the scratch (or in-place ledger if absent), writes the pointer (replacing a same-id pointer), prints `<run-key> <ledger-path>` | 0 / 1 io / 2 usage |
| `append <run-id> <phase>` | stdin, one record per line → `<run-id> <phase> <record>` appended to the pointer's ledger (`>>`, one `write` per line) | 0 / 1 no pointer or empty record / 2 |
| `move <run-id> <worktree>` | appends the scratch body in order to `<worktree>/.claude/craft-run-record.md` (header if absent), retargets the pointer, removes the scratch — one invocation | 0 / 1 / 2 |
| `locate --transcript <path>` \| `locate --run <run-id>` | prints `<run-id> <ledger-path>` for the bound pointer whose ledger exists (newest run-key wins), or nothing | 0 (also when nothing is bound) / 2 |
| `close <run-id>` | removes pointer, scratch, delta file | 0 / 1 |
| `dir` | prints `<main>/.claude/craft-runs` | 0 / 1 outside a repo |

The script resolves `<main>` itself, so the caller's cwd may be the checkout, the worktree or a
subdirectory (P1). It needs git ≥ 2.31 (`--path-format`). Where rev-parse fails, `locate` treats
the cwd as "not a repo" and prints nothing, while `open` exits 1 and the orchestrator surfaces it.
`--transcript` binding means `grep -F -q -- "<run-key>" <transcript>`, which stops at the first
match: `open` printed the key, so it sits in the orchestrator's transcript (P2). A missing or unreadable
transcript counts as unbound (exit 0, nothing printed). A crashed run's pointer is never in another
session's transcript. A failed append follows the spec's existing posture: surfaced in-session, and the run continues.

### New ledger tokens (R12) — all fixed, greppable, one line

| Token | Emitted at | Consumer |
|---|---|---|
| `RESOLVE: <craft flags verbatim, or none>` | §0 step 4, the run's first record | rebuild step 1 |
| `AWAITING(propose): <ids comma-joined, or none>` | §0 step 1d (appended at step 4 with the other §0 lines) | `run-state` cross-check |
| `PHASE-START(<phase>): <iso8601>` | walk step 4, just before `contract-assemble` | `run-state`; `Done` `--since`; steer hook's in-flight list |
| `PHASE-DONE(<phase>): <one-line outcome>` | walk step 7, every phase that ran (NO-OP phases included) | `run-state` (ADR-379); steer hook's in-flight list |
| `PART(<n>): <sha> size=<size> outcome=<pass\|blocked>` | implementation procedure 2, right after the part is verified | resume table; memory delta |
| `FINDINGS(<dimension>): c<cycle> <path> n=<count>` | review procedure 2, in the Bash call that writes the file | resume table |
| `HARNESS-BG(<phase>:<technique-id>): pid=<pid> out=<path> spec=<path>` | validation procedure 1, the backgrounded command's first statement (it knows `$$` and the paths) | resume table |

`out=`, `spec=` and `FINDINGS` paths are absolute temp paths. They never become store entries:
the delta derivation reads only concern-keyed facts, so the spec's path/secret discipline is
unaffected. The existing `GATE`, `NO-OP`, `auto-skip:`, `WAIVER:` and `POLICY` tokens are unchanged.

### Run-skill changes (no renumbering)

- **§0 step 4:** replace "buffer the lines in-session" with `run-ledger.sh open <run-id>`, then
  append the held §0 lines in order (`RESOLVE`, `Resolution.record[]`, config/load notes, waivers,
  `AWAITING`). From here on every line goes through `append`.
- **§0 step 1d:** store `awaitingHarnesses[]` in-session as today and also emit `AWAITING(propose):`.
- **Walk step 4:** append `PHASE-START`. **Walk step 7:** append `PHASE-DONE` plus the existing
  `GATE`/`NO-OP`/`inline:` lines, and drop the "flushing … phase-boundary flush" wording.
- **Cross-phase invariants:** the awaited set is "the `AWAITING(propose):` set minus recorded
  releases", which is the same release rules as today, now stated as ledger facts.
- **`## Done`:** the residual flush paragraph goes. `save` reads `<run-id>.delta.json`, and
  `emit-metrics --since` takes the relevant `PHASE-START` iso. `run-ledger.sh close` is the last action.
  Once teardown has run, the orchestrator stops appending, and later lines stay in-session exactly
  as the spec's "Teardown ran" case already states.
- **New `## Rebuild after compaction`** (between "Review cadence" and "Done"). See below.
- Phase skills: `workspace` step 2 runs `git worktree add`, `worktree-setup.sh` and `move` in **one**
  Bash call, so a compaction cannot split them. `implementation`
  procedure 2 appends `PART`. `review` procedure 2 writes each normalised `Finding[]` to the temp
  dir and appends `FINDINGS` in the same call. `validation` procedure 1 (background bullet) appends
  `HARNESS-BG` in the call that starts the run. `integrate` step 3 writes the delta to
  `<run-id>.delta.json`. The four preambles that say "WRITES (buffered to run record, flushed at run end)"
  (workspace, implementation, review, validation) now say "appended to the run record as produced;
  saved to the store once at `Done`".

### Compaction hooks — shared binding `hooks/bound-run.sh`

Both hooks (R5, R13) open with the same steps under one no-op contract (R6), so a sourced helper holds
them (precedent: `scripts/worktree-setup.sh` sources `scripts/detect-ecosystem.sh`):

- `bound_run` reads the payload on stdin, takes `.cwd` (fallback `CLAUDE_PROJECT_DIR`) and
  `.transcript_path` via `jq`, and runs `run-ledger.sh locate --transcript <path>` from that cwd
  (resolved relative to `BASH_SOURCE`). It prints `<run-id> <ledger-path>`, or nothing on a missing
  `jq` (one stderr line), no `transcript_path`, a bad cwd or a failed `locate`. It returns 0.
- `never_block <hook-name>` traps `EXIT`: a non-zero status prints `craft <hook-name>: failed (exit
  <rc>)` on stderr and exits 0, because a failing `awk`/`grep`/`jq` under `set -euo pipefail` can
  exit 2, and a `PreCompact` exit 2 blocks the compaction (P5). Both hooks call it first.

The payload is Claude-shaped (ADR-223), so the helper lives in `hooks/` and `run-ledger.sh` stays
harness-neutral (ADR-380). The texts stay per script: one addresses the resumed model, the other the
summariser. Each hook prints its composed text with one `printf`, so a failure leaves stdout empty.

### Reorient hook — `hooks/reorient-after-compact.sh` (R5, ADR-373, ADR-376)

The brief names `scripts/`. It goes in `hooks/` because every plugin hook lives there and the
`runHook` helper and fixtures in `test/hooks.test.js` read `hooks/`. Registration in `hooks/hooks.json`:

```json
"SessionStart": [{ "matcher": "compact", "hooks": [
  { "type": "command", "command": "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/reorient-after-compact.sh" } ] }]
```

Algorithm: `never_block reorient-after-compact`, then `bound_run`; nothing printed → exit 0. Otherwise print:

```
craft reorient — if you are not the craft orchestrator driving run <run-id>, ignore everything after this paragraph. Craft sub-agent: your task is still the prompt you were spawned with; re-derive your progress from `git status`, `git log` and the files you wrote; never repeat a commit that already landed.
Orchestrator: your context was just compacted. Trust the run ledger over the summary.
Ledger: <ledger-path>
Rebuild (skills/run/SKILL.md, "Rebuild after compaction"):
1. Re-run §0 steps 0b, 1 and 1b with the flags on this run's RESOLVE: line.
2. load() the memory store; consult() the intention view.
3. Pipe that Resolution into: node <craft-root>/engine/bin/run-state.js <ledger-path> --run <run-id>
4. Resume every inFlight phase per the resume table, then walk from next.
Ledger tail (last <k> of <n> lines of run <run-id>):
<lines of this run-id, tail -n 30, each cut to 200 chars>
```

The guard is the first line because the hook cannot tell a sub-agent's compaction from the
orchestrator's (Q3). Output is bounded to 30 × 200 characters plus ~1,100 of fixed text, under
8,000, so it does not depend on any unpinned hook-output limit. The hook never writes. The stale-pointer
sweep belongs to `open`.

### Summary-steering hook — `hooks/steer-compact-summary.sh` (R13, ADR-375)

Registered beside the reorient entry with the empty matcher, the one pinned on both triggers (P4,
spike A): a user-typed `/compact` is steered too, and the user's own text still reaches the summary.

```json
"PreCompact": [{ "matcher": "", "hooks": [
  { "type": "command", "command": "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/steer-compact-summary.sh" } ] }]
```

Algorithm: `never_block steer-compact-summary`, then `bound_run`; nothing printed → exit 0. Otherwise
one `awk` pass over the whole ledger keeps this run-id's `PHASE-START(`/`PHASE-DONE(` records; the last
event per phase wins (ADR-379). Phases whose last event is `START`, in first-seen order, joined with
`, ` and cut to 200 characters, form the in-flight list (`none recorded` when empty). The whole file,
not a tail: a long implementation phase pushes its `PHASE-START` out of any fixed tail, and the ledger
is KB-sized. No node: `run-state` needs a re-resolved `Resolution` that a hook cannot build, and
summariser inference is not exact. `run-state` stays the rebuild's authority (R7); the tests pin both
implementations on the same ledgers. Then print:

```
craft compaction note: craft run <run-id> is bound to this session. Decide whose conversation you are summarising and apply only the matching paragraph.
If it is the craft orchestrator's (it drives the craft workflow and calls run-ledger.sh), the summary must keep verbatim: run-id <run-id>; ledger <ledger-path>; phase(s) in flight: <in-flight list>; every commit hash that landed; any question put to the user and not yet answered, word for word; and the sentence "The run ledger outranks this summary."
If it is a craft sub-agent's (it opens with a spawn prompt for one task and never calls run-ledger.sh), the summary must keep verbatim: the task statement of its spawn prompt; every file path it wrote; every commit hash it landed; the last step it completed. Leave out the run-id and ledger path: a sub-agent never writes the ledger.
If neither, ignore this note.
```

The payloads cannot say whose conversation is summarised (Q3), so the note names both cases, in
ADR-375's order, and the summariser decides from content: only the orchestrator calls `run-ledger.sh`
(R4; `open` and every `append`), while a sub-agent's conversation opens with its spawn prompt. The
fixed text is ~830 characters: with the list cap and two run-id slugs it stays under 2,000 for any
ledger path under 800 characters, so the path is never cut. No ledger tail: re-injection is the
reorient hook's job, and a tail in summariser instructions would be paraphrased (Q6) and enlarge
every summary call (Q7).

### `run-state` — rebuild derivation (engine bin, R7)

Following the house bin shape: `engine/bin/run-state.js` → `engine/src/run-state-main.js`
(`main(argv, io)`) → `engine/src/run-state.js` (pure `deriveRunState(lines, runId, resolution)`).

```
pipeline-resolve … | node engine/bin/run-state.js <ledger-path> --run <run-id>
{ "run": "demo",
  "completed": ["workspace","design","decisions","planning","implementation"],   // effective order
  "inFlight": [{ "phase": "review", "since": "2026-09-22T10:40:00Z" }],
  "next": "validation",
  "awaitingHarnesses": ["validation","architecture"],
  "parts": [{ "n": 1, "sha": "abc1234", "size": "S", "outcome": "pass" }],
  "findings": [{ "dimension": "code", "cycle": 1, "path": "/tmp/…/code.c1.json", "count": 3 }],
  "background": [],
  "warnings": [] }
```

- Only lines whose field 1 equals `--run` count, which covers the inherited run-id-collision edge. A
  line is `<run-id> <phase> <record>`, and tokens are matched with regexes anchored at record start.
  `auto-skip:` reuses `autoSkipPhasesInText` (`engine/src/observability/skip-signals.js`).
- Per phase, the **last** of `PHASE-START`/`PHASE-DONE` wins, so a re-run phase (e.g. a design
  revision) goes back in flight. `completed` = last-event-`DONE` ∪ `auto-skip:`. `inFlight` =
  last-event-`START`, so validation ∥ documentation yields two entries. `next` = the first
  `effective[]` id in neither set.
- Released(id) ⇔ `auto-skip: id` ∨ exact `NO-OP(id):` (not `NO-OP(id:<technique>)`, not
  `NO-OP(verify)`) ∨ last `GATE(id)` is `green`. `awaitingHarnesses` = `AWAITING` set − released.
  If `AWAITING` ≠ `gateDecisions[propose].awaitingHarnesses` as sets, exit 1 with both sets on stderr
  (the manifest or flags changed mid-run).
- A ledger phase absent from `effective[]` or a token line failing its regex (e.g. a temp path
  containing whitespace) adds a `warnings[]` entry. A missing or unreadable ledger exits 2, and so does
  unparsable stdin.

### Rebuild procedure and resume table (R8)

If there is no reorient block (non-Claude harness, hook not installed), `run-ledger.sh locate --run <run-id>`
recovers the ledger. The run-id is the topic slug, re-derivable from the `/craft:run` user message
the summary keeps verbatim (Q6). A foreground spawn blocks the orchestrator, so no orchestrator
compaction can happen while one runs (consistent with Q2: 0 main boundaries while the spawn
compacted 3 times). The only work that can outlive an orchestrator compaction
is a background Bash run, and that is what `HARNESS-BG` records. Re-entering an in-flight phase
re-runs walk steps 2–4, all of which are idempotent, and then applies:

| In-flight phase | Resume from |
|---|---|
| any agent phase except review | the phase's committed artifact (design doc, plan, ADRs, commits). A dead or lost spawn is a fresh respawn from the artifact (existing invariant). |
| `workspace` | the pointer still names the scratch and `../<repo>-<slug>` exists on `<type>/<slug>`: run `move` and continue. Never re-create the worktree, because the collision rule would STOP on the run's own tree. |
| `decisions` | ADRs are committed one at a time; the user's answers survive as verbatim user messages (Q6) |
| `implementation` | `parts[]` + `git log` against the plan. A landed commit without a `PART` line is verified, then gets its line (with `size=?` if unknown, as in H5). Continue at the first part with neither. |
| `review` | reload `findings[]` for the current cycle; `git log` fix commits; `RULED-OUT` lines. A dimension with no `FINDINGS` line for the cycle is re-spawned, because a compaction right after the fan-out returns can drop reviewer output before it is persisted. |
| `validation` / `architecture` | `background[]`: pid alive (`kill -0`) → wait. Dead with non-empty `out` → triage. Dead with empty `out` → the existing empty-output blocker. |
| `propose` / `integrate` | query the PR's state (VCS port) before `pr create`, and CI and merge state before merging |
| `integrate` (after teardown) | the ledger is gone and the hook stays silent. `Done` reads `<run-id>.delta.json`, never a summarised delta. |

### Sub-agents (D1, D2) — ADR-376

The hook reaches every compacting spawn during a run (Q3, Q4), so the reorient block's first
paragraph *is* the per-agent survival instruction. No discrimination is needed. The spawn prompt is
the sub-agent's first user message, which the summariser copies verbatim (Q6; unpinned for very
long prompts). The steer note's sub-agent paragraph (ADR-375) also asks the summary itself to keep
the task statement, the files written and the commits landed, which narrows the long-prompt gap (live smoke). Every role's output except the reviewer's is a commit or a committed file. Reviewer output is covered by the respawn row above.
The turn-budget self-count may drift after a compaction. ADR-361's telemetry audit is the backstop,
and no mechanism is added. Exposure at the recommended threshold: a spawn fires at
`min(W, window) − 33000`, which is 200k on a 1M-window model and 167k on a 200k-window model. On the
last recorded run, planning (avg ctx 222k) and validation (avg ctx 250k) sit above that line.

### Metrics — estimated compaction cost (D3, R9, ADR-382)

- **Claude binding** (`telemetry.js` `parseLines`): a boundary line (P3) opens a pending compaction
  `{ run: sessionId, sourceKind, preTokens }`, path-free and text-free. The next `isCompactSummary` line
  in the same transcript closes it with `summaryChars`. If no summary line follows, the output term
  falls back to spike A's measured output range [1,300, 2,600] and the entry is flagged `summaryMissing`. `--since`
  applies to the boundary's timestamp. `--no-inline` does not touch compactions, the same as it
  leaves `auto-skip:` markers alone. `parseLines` returns a new `compactions: CompactionEstimate[]`
  alongside `events`/`markers`. A boundary never becomes a `UsageEvent`. Other bindings return
  nothing, and `streamTranscriptFiles` defaults the field with `?? []`.
- **Estimate** (vendor-specific constants, so they live in the Claude adapter): `cacheRead = preTokens`,
  `input ∈ [3000, 5500]`, `output ∈ [1.2, 2.8] × ⌈summaryChars / 4⌉` (2× ±40%), cacheCreation ≈ 0 (< 110 measured).
- **Core** (`usage-aggregate.js`): `aggregate(events, priceTable, baselineReport, threshold, skipMarkers, compactions = [])`
  adds `runs[*].compactionEstimate = { count, main, subagent, input: [lo,hi], cacheRead, output: [lo,hi], equiv: [lo,hi], basis: "estimate" }`,
  computing `equiv` with ADR-369's weights (exported from `metrics-line.js`). The key is omitted when
  count is 0, so existing report fixtures stay byte-identical. Groups, totals, cost, drift and
  baselines never read it. Markdown adds one line per run:
  `Compactions: 3 (main 1, sub-agent 2) — estimated summary-call cost 41k–78k equiv (estimate; not in totals)`.
- **Worked check against spike A.** Probe A2 #1: preTokens 24,715, summary 3,380 chars = 845 tokens
  → equiv [3,000 + 2,472 + 5×1,014; 5,500 + 2,472 + 5×2,366] = [10.5k, 19.8k], measured 12.4k.
  #2: 24,707 and 4,906 chars → [12.8k, 25.1k], measured 18.1k. Both fall inside the band.
- `docs/contributing/specs/telemetry.md`: add a `compactions` bullet to the port-interface post, the
  detection and formula to the Claude binding section, and the key to "Per run". Schema version stays 1
  (the key is additive).

### Docs (R10, R11)

- `docs/guides/customizing.md` §4 gets a new use-pattern subsection, "Long sessions — auto-compaction (Claude Code)".
  It covers: the 1M default fires at 967k; the recommended value `233000` (ADR-374); per-session
  `claude --settings '{"autoCompactWindow":233000}'` or user settings; the value is read at launch
  only and inherited by every spawn; the plugin's two compaction hooks (reorient, steer), both silent
  outside a craft run; craft never writes settings.
- `docs/contributing/specs/auto-compaction-poc-record.md` follows the `*-poc-record.md` shape (verdict,
  target host, matrix, per-question tables: Q1 pins, Q3 payload shapes with `<sid>`/`<proj>`
  placeholders, Q6 scoring, Q7 table, spike 2 routes, P1–P5). No session id, transcript path, agent
  id, nonce or home path appears, and there is no technique tool name (class A).

### Edge behaviour

| Situation | Behaviour |
|---|---|
| no craft run / non-git cwd / no `.claude/craft-runs/` | both hooks: exit 0, empty stdout |
| payload without `transcript_path`; transcript missing or unreadable | unbound: both hooks silent, `locate` never called with an empty path |
| a hook step fails (`jq` missing, unreadable ledger, `awk` error) | `never_block`: one stderr line, exit 0, empty stdout. Never exit 2, which would block the compaction (P5). |
| pointer exists, key not in this transcript (crashed run, other session, `/clear`, a `--resume` that changed transcript) | silent. Rebuild remains available via `locate --run`. |
| bound pointer, ledger gone (torn down) | silent. The next `open` sweeps the pointer. |
| two bound pointers (crashed run, then a new run, same session) | newest run-key wins |
| two concurrent runs from one checkout | each session binds only its own key. Same run-id twice: `open` replaces the pointer and says so on stderr (inherited run-id collision; `workspace` STOPs on the path collision). |
| sub-agent compaction; manual `/compact [<text>]` | same block (`SessionStart[compact]` fires on both, Q3, P4); the guard routes it. The steer note fires on both (matcher `""`), adds to the user's `<text>` without replacing it (P4), and the summariser picks the paragraph. |
| compaction inside §0 before step 4 | no pointer, so silent; the summary keeps the `/craft:run` message; §0 re-runs (idempotent) |
| compaction after `open`, before any `PHASE-START` | steer note says `none recorded`; the rebuild derives the phase from the ledger |
| compaction during `workspace`, before `move` | the note names the scratch path; the rebuild re-locates through the pointer (reorient block or `locate --run`), never from the summary |
| compaction between a result and its append | gate re-runs; commit verified from git; reviewer respawned; `PART` re-derived |
| background shells across a compaction | unpinned whether they survive. The resume row handles alive and dead alike. |
| `AWAITING` vs re-resolved `Resolution` mismatch | `run-state` exit 1 → blocker `{ rebuild, reason, options }` |

### Files touched (planner pre-chew)

| File | Symbol / anchor | Change |
|---|---|---|
| `scripts/run-ledger.sh` | new | verbs above; `set -euo pipefail`; shellcheck-clean |
| `hooks/bound-run.sh`, `hooks/reorient-after-compact.sh`, `hooks/steer-compact-summary.sh` | new | the helper (`bound_run`, `never_block`, sourced under a `# shellcheck source=` line) and the two hooks; the `hooks/*.sh` shellcheck glob covers all three |
| `hooks/hooks.json` | `hooks` object | add `SessionStart` (matcher `compact`) and `PreCompact` (matcher `""`), both shimmed |
| `engine/src/run-state.js`, `engine/src/run-state-main.js`, `engine/bin/run-state.js` | new | bin shape of `engine/bin/pipeline-resolve.js` |
| `engine/src/observability/adapters/claude/telemetry.js` | `parseLines` (L237), returns `{events, skipped, markers, unlabelled}` | + `compactions` |
| `engine/src/observability/usage-mine-main.js` | `streamTranscriptFiles` (L~267), `main` → `aggregate(…)` (L~481) | thread `compactions` |
| `engine/src/observability/usage-aggregate.js` | `aggregate` (L~521), `renderMarkdown` (L~570) | `compactionEstimate`, one Markdown line |
| `engine/src/observability/metrics-line.js` | `EQUIV_WEIGHT_*` (L25-28) | export |
| `skills/run/SKILL.md` | §0 1d, step 4; walk steps 4, 7; invariants; new section; Done | as above |
| `skills/{workspace,implementation,review,validation,integrate}/SKILL.md` | anchors in "Run-skill changes" | as above |
| `docs/contributing/specs/run-record.md` | L9-19, L97-124, L126-136, L183, vocabulary L56-61 | the write rule, `craft-runs/`, tokens, a "Compaction survival" section naming both hooks |
| `docs/contributing/specs/telemetry.md`, `docs/guides/customizing.md`, new poc-record | — | as above |

## Decision candidates

All ten are settled ("ratified": the user chose; "adopted": as recommended, no user judgment). The
`PreCompact` design adds no open candidate: its choices follow from P4, P5, ADR-223, ADR-379 and ADR-380.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Hook activation | (a) always-on plugin hook; (b) opt-in manifest key; (c) opt-in settings snippet the user copies | (a) → **ADR-373, ratified (a)** | The no-op path costs a `jq` parse and one `git rev-parse`, and prints nothing. Opt-in leaves the default unsafe for exactly the user who forgot to opt in. |
| 2 | Recommended `autoCompactWindow` | (a) `233000` (fires at 200k); (b) `283000` (fires at 250k); (c) document the formula, no value | (a) → **ADR-374, ratified (a)** | Spike A's figure, and it keeps orchestrator turns ≤ 200k. Cost: planning and validation spawns will compact mid-task. (b) spares most planning spawns at +50k context on every orchestrator turn. Net token effect on spawns is extrapolated, not measured. |
| 3 | `PreCompact` instruction hook | (a) not now; (b) add now, same locate/guard, telling the summariser to keep run-id, ledger path, in-flight phase and landed commit hashes | (a) → **ADR-375, ratified (b), against the recommendation** | The designer argued that reinjection already scored 6/6 exact (Q6), so YAGNI. The user chose (b): the summary itself keeps the run's anchors, which orients the orchestrator before it reads the reorient block and keeps a sub-agent's task and commits. Designed in "Summary-steering hook" (R13). |
| 4 | D1 per-agent survival | (a) the block's sub-agent paragraph + reviewer respawn rule; (b) (a) + one `contracts/core.md` line so it also holds on non-Claude harnesses; (c) per-spawn state file | (a) → **ADR-376, ratified (a)** | The hook reaches spawns anyway, and all outputs except reviewers' are commits. (b) is the portable variant, at the cost of a line in every spawn plus contract-test churn. (c) costs agent turns and adds in-tree sweep risk. |
| 5 | Active-run discovery + staleness | (a) pointer in `<main>/.claude/craft-runs/`, bound by run-key ∈ transcript; (b) scan `git worktree list` + probe ledgers, same binding; (c) pointer bound by `session_id` | (a) → **ADR-377, adopted (a)** | (a) is O(1) and covers the pre-workspace window. (b) still needs the scratch for that window. (c) needs the orchestrator to learn its own session id, which is unpinned and would need a probe. |
| 6 | Scratch ledger location | (a) `<main>/.claude/craft-runs/<run-id>.pre.md`; (b) out-of-tree mktemp named by the pointer; (c) no scratch: re-run §0 after a pre-workspace compaction | (a) → **ADR-378, adopted (a)** | (a) keeps one directory and is swept by `open`. (b) adds temp-cleanup semantics for no gain, since the pointer already writes the checkout. (c) is cheapest, because every pre-workspace line is re-derivable, but it contradicts brief scope 1. |
| 7 | Phase-completion token | (a) `PHASE-START` + `PHASE-DONE`; (b) `PHASE-DONE` only; (c) no token: artifacts + `GATE`/`NO-OP`/`auto-skip:` | (a) → **ADR-379, adopted (a)** | Five phases are gate-less and `GATE` can be red before green. `PHASE-START` also persists the `--since` iso that `Done` needs and distinguishes mid-phase from not-started. (c) is brittle. |
| 8 | Ledger write surface | (a) `scripts/run-ledger.sh` shared by skill and hook; (b) raw `>>` per write point, with the hook re-implementing lookup; (c) a node engine bin | (a) → **ADR-380, adopted (a)** | One root resolution for both callers (DRY), testable in a mktemp repo, and it keeps node out of the hook. (b) is today's approach and duplicates the lookup. |
| 9 | Review `Finding[]` location | (a) out-of-tree `mktemp -d`, path on the `FINDINGS` line; (b) `<worktree>/.claude/craft-review/`; (c) inline in the ledger | (a) → **ADR-381, adopted (a)** | Follows validation's out-of-tree precedent (`contracts/producer.md` throwaway discipline): no sweep risk in repos that do not ignore `.claude/`. (c) floods the hook's tail. |
| 10 | Where the D3 estimate surfaces | (a) miner report only; (b) + a metrics-ledger column (format boundary); (c) + one advisory line from `emit-metrics` at `Done` | (a) → **ADR-382, adopted (a)** | This is what the acceptance names. (b) breaks row comparability (ADR-369 rationale). (c) is a cheap later add. |

## Test strategy

All tests use Given/When/Then titles and AAA bodies with `sut`. Fixtures are asymmetric where fold
or sum could collide, and every repo is a realpath'd mktemp (`test/helpers/tmp-git-repo.js` caveat).

- **`test/run-ledger.test.js`** (new, repo + `git worktree add` throwaway): `open` prints a key matching
  `^<id>@\d{4}-…Z <path>$` and writes header + pointer. `append` from the worktree cwd lands in the
  scratch, prefixed. `move` appends the scratch body after an existing worktree header without
  duplicating it, keeps order, removes the scratch and retargets the pointer. `open --in-place` writes
  no scratch. `open` sweeps a pointer whose ledger is missing but keeps a live one. `locate --transcript`
  prints nothing when the key is absent and the pair when present; with two bound pointers the
  newer key wins. `close` removes all three files. `append` with no pointer exits 1 with stderr.
- **`test/hooks.test.js`**: `hooks.json` parses; `SessionStart[0].matcher === "compact"`, `PreCompact[0].matcher === ""`;
  both commands are shimmed paths to existing executables. Payloads carry a generated cwd and
  transcript, so `runHook` gains a payload-object variant beside the fixture-file one.
  - **Silent no-op, one case table run against both hooks:** non-git cwd, no run dir, unbound
    pointer, torn-down ledger, payload without `transcript_path`, missing transcript file → `''`,
    exit 0. Unreadable ledger (mode 000, skipped as root) → `''`, exit 0, one `failed (exit` stderr line.
  - **Reorient, bound from a worktree cwd:** stdout's first line starts `craft reorient — if you are
    not the craft orchestrator`, contains `RESOLVE:` and only this run-id's lines, excludes another
    run-id's lines, and has length ≤ 8000 with a 500-line ledger of 1,000-char lines.
  - **Steer, bound from a worktree cwd:** first line starts `craft compaction note: craft run <id>`;
    the orchestrator paragraph precedes the sub-agent one and holds the run-id, the ledger path and
    `phase(s) in flight: review` (mid-review ledger); the sub-agent paragraph excludes the ledger path.
    In-flight matrix on ledger lines copied from `run-state.test.js`, so both implementations of the
    rule see the same inputs: design `START`/`DONE`/`START` → `design`; validation ∥ documentation →
    `validation, documentation`; §0 only → `none recorded`; another run-id's open phase is not listed.
    Bound: ≤ 2,000 characters with a 500-line ledger of 1,000-char lines and 40 open 30-char phases.
- **`engine/test/run-state.test.js`** + `run-state-main.test.js` + `run-state.bin.test.js`: completed,
  inFlight and next on a mid-review ledger. A revision (`START`/`DONE`/`START` design) puts design in
  flight. Release matrix: `auto-skip`, exact `NO-OP(validation)` and `GATE green` release;
  `NO-OP(validation:<t>)`, `NO-OP(verify)` and `GATE red` after green do not. Another run-id's lines
  are ignored. An `AWAITING` mismatch exits 1. A missing ledger exits 2. **Survival acceptance:**
  `pipeline-resolve pipeline/default.yml <fixture manifest enabling architecture>` piped into the bin
  with a ledger stopped mid-validation (`HARNESS-BG`, documentation in flight, architecture
  auto-skipped) gives `next: "propose"`, `awaitingHarnesses: ["validation"]` and one background entry.
- **`engine/test/telemetry-claude.test.js`** + `fixtures/telemetry/compaction-main.jsonl`,
  `compaction-subagent.jsonl`: two boundaries with different `preTokens` and summary lengths give two
  estimates with distinct bands. The boundary and summary lines add no `UsageEvent`, so the events
  equal the same fixture with them stripped. A missing summary sets `summaryMissing` and the fallback
  band. `--since` drops the earlier boundary.
- **`engine/test/usage-aggregate.test.js`**: `compactionEstimate` sums bands and `equiv` matches the
  A2 worked check. Groups, totals and cost are deep-equal with and without compactions. The key is
  absent at count 0. Markdown contains `(estimate; not in totals)`.
  **`usage-mine-main.test.js`**: `streamTranscriptFiles` threads `compactions` and defaults `[]`.
- **Prose pins** (`test/run-record.test.js`): §0 step 4 region names `run-ledger.sh open` and no
  longer says "buffer the lines in-session". Walk step 7 no longer says "phase-boundary flush". The
  spec and the skill both carry the flush-per-line sentence. Every new token appears in the spec's
  vocabulary and in its emitting skill. `## Rebuild after compaction` exists and names `run-state.js`.
- **Pinned-count updates**: `test/craft-root-shim.test.js` counts for each touched file (`hooks/hooks.json`
  1 → 3, and a new `skills/implementation/SKILL.md` entry if it gains a shim); `test/living-corpus.test.js` EXPECTED
  plus the poc-record. The class-A hygiene test must stay green unmodified.
- **Live smoke (on demand, recorded in the poc-record, not CI)**: a throwaway session with
  `--settings '{"autoCompactWindow":100000}'` and the plugin installed (not a settings hook) runs
  `run-ledger.sh open`, then fills context until compaction. This checks that the plugin-registered
  hook fired, that the block reached the model (nonce), that transcript binding held, and that a
  sub-agent compaction received the guard. For the steer hook it reads each `isCompactSummary` line:
  the main summary holds the run-id, ledger path and in-flight phase; a sub-agent's holds its task
  statement and no ledger path; a manual `/compact` is steered too. It closes three unpinned assumptions:
  plugin versus settings hook parity, key-in-transcript on a real main session, and paragraph choice.

## Out of scope

- The headless loop — shelved (spike B/C).
- The ~19k per-spawn attachment tax, model routing, and the `git-no-ext-diff` over-match on `git show -s`. Separate work, per the brief.
- Compaction hooks for the codex, opencode, pi and cursor bindings: their compaction behaviour is unpinned (ADR-223, per-binding).
  The skill's rebuild procedure is harness-neutral and still applies there via `locate --run`.
- Blocking a compaction from `PreCompact` (exit 2, P5): the hook cannot see the loss window, and a blocked auto-compaction leaves the session above its threshold.
- Writing the user's settings, and per-agent thresholds. The window is inherited unchanged (Q2), so there is nothing to set per agent.
- Exact summary-call accounting via the `--debug` log: an ad hoc source only, since D3 forbids a hook and a file.
- Resuming a crashed run from a fresh session. The rebuild procedure makes it possible, but it is not a requirement here.
- The final message's run record after teardown plus a compaction: it may be partial, and the PR body already carries the record.
