---
name: metrics
description: Mine transcript data for the current repo and report token usage, cost, cache performance, and model-routing recommendations. Triggers — "craft:metrics", "show usage metrics", "mine transcripts", "report token cost", "usage report for this repo".
argument-hint: []
---

# craft:metrics — usage-telemetry front door

Standalone session-owned skill. You (the session) probe the current repo's transcript directory,
invoke the miner, and report the output paths. No worker agent is spawned. This skill is
ADVISORY — an absent, empty, or malformed transcript directory produces a recorded no-op and
exits 0; it is never a blocker.

Input: `$ARGUMENTS` (zero-argument; optional pass-through flags accepted if the user supplies
them — see Step 1).

> **Shell entry:** `scripts/mine-transcripts.sh` is a shell convenience wrapper around the same
> miner for direct terminal use (e.g. `bash scripts/mine-transcripts.sh`).
> It is equivalent to invoking this skill but bypasses the skill preamble checks.

---

## Preamble — read-only probe

Before invoking the miner, confirm the environment and resolve where transcripts would live.

### 1. Plugin root

Confirm `${CLAUDE_PLUGIN_ROOT}` is set and the entrypoint exists:

```bash
test -f "${CLAUDE_PLUGIN_ROOT}/engine/bin/usage-mine.js"
```

If the test fails, surface a diagnostic and stop — the plugin installation is incomplete.

### 2. Transcript directory

The miner resolves the transcript directory for the current working directory internally
(`cwd → dashes` mapping). You do not need to construct or validate the path yourself.
An absent or empty directory is within the miner's advisory contract — it writes a
no-data report and exits 0. Never abort the skill on a missing directory.

---

## Procedure

### Step 1 — Mine

Run the miner with zero arguments (or forward any flags the user explicitly supplied):

```bash
node "${CLAUDE_PLUGIN_ROOT}/engine/bin/usage-mine.js"
```

Optional flags (pass through verbatim when the user supplies them):

| Flag | Purpose |
|---|---|
| `--dir <path>` | Override the resolved transcript directory |
| `--baseline <path>` | Baseline report for delta comparison and drift detection — e.g. the committed `docs/metrics-baseline.report.json` snapshot |
| `--threshold <n>` | Relative-delta threshold for the drift signal (default `0.25`); only used when `--baseline` is also supplied |
| `--since <date>` | Restrict to transcripts on or after this date |
| `--prices <path>` | Custom pricing table (JSON) |
| `--include-inline` | Include inline-phase transcript segments |

Passing `--baseline docs/metrics-baseline.report.json` compares the current run against the
committed snapshot: `report.json` gains a `drift` array flagging any `(phase, dimension)` pair
whose per-occurrence mean token cost or duration moved beyond `--threshold` relative to the
baseline's mean — corpus-size-invariant, so re-mining a grown corpus is not drift; a phase
with no baseline activity carries a `null` delta (rendered "new") — and `report.md` gains a
"Phases drifted since baseline" section when any phase drifted. This is a prompt-regression
signal only — advisory, never a gate (see error semantics below).

The bin writes two artefacts inside the repo and exits 0 in all handled cases:

- `report.json` — machine-readable usage summary (consumed by `craft:init` and by
  the workflow-improvement loop)
- `report.md` — human-readable narrative (cache performance, cost breakdown,
  model-routing recommendations)

### Refreshing the committed baseline

`docs/metrics-baseline.report.json` is the drift reference. Refreshing it is a
**deliberate, reviewed act** — never a side effect of running the miner:

1. Refresh **when the prompt surface changed on purpose** — a run that edited
   `skills/` or `agents/` lands with intentionally different per-phase economics, and
   drift measured against the pre-change baseline would flag the intended shift
   forever. The integrate phase offers this step when the merged run touched those
   paths.
2. Re-mine over the full transcript corpus, then copy `report.json` over
   `docs/metrics-baseline.report.json` and commit it in the same PR/change that
   altered the prompts (`chore(metrics): refresh drift baseline`), so the diff review
   sees old-vs-new economics side by side.
3. Never refresh to silence an *uninvestigated* drift flag — that converts the alarm
   into the regression.

---

### Done

After the bin exits 0, report:

- **Artefact paths**: `report.json` and `report.md` (relative to the repo root)
- **One-line summary**: surface the cache-creation hotspot and the top model-routing
  recommendation read from the bin's stdout or from `report.json`
  (e.g. "Highest cache-creation overhead: `implementation` phase — consider an
  explicit checkpoint. Top recommendation: route `reviewer` to a lighter model tier.")

**Downstream consumers of `report.json`:**

1. **Workflow improvement** — review the cache and cost breakdown to tune phase ordering,
   checkpoint placement, and model-routing hints across the craft pipeline.
2. **`craft:init`** — the initialiser reads `report.json` to pre-fill model-routing
   suggestions and gate recommendations in a new named manifest.

---

## Error semantics

| Condition | Behaviour |
|---|---|
| Absent transcript directory | Advisory no-op: miner writes a zero-data report, exits 0; skill reports the no-data report paths and continues |
| Empty transcript directory | Same as absent — recorded no-op, exit 0 |
| Malformed transcript files | Miner skips unparseable entries; exits 0 with a partial report; skill surfaces a warning from the bin's stderr and reports the partial paths |
| `--dir` path out of bounds | Miner enforces path containment, writes a no-data report, exits 0; skill reports the paths and continues |
| Plugin root missing | STOP; surface "engine/bin/usage-mine.js not found — check CLAUDE_PLUGIN_ROOT"; do not invoke the bin |
| Bin stderr output | Surface stderr diagnostic as a warning; report what artefacts are available and continue — the miner always exits 0 |
| `--baseline` absent or unreadable | Drift is advisory: `report.drift` is empty and no "Phases drifted" section is rendered; exits 0 and continues — never a gate |
