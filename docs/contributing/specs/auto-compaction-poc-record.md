# Auto-compaction PoC — spike evidence record

> This document is the evidence record backing the design's "Pinned external behaviour"
> table for automatic context compaction — the fire-point formula, the hook order and
> payload shape, survival scoring, and per-compaction cost. Every finding here traces to a
> pinned probe run against the real Claude Code CLI in a throwaway, isolated session, never
> to a training-data assumption.

## Verdict: **GO** (2026-09-21) — CLI 2.1.278

Both feasibility criteria were met: the fire point is controllable via settings
(`autoCompactWindow`, a deterministic formula), and a hook fires on automatic compaction with
stdout that reaches the model (`SessionStart`, source `compact`). Probes ran on a 200k-window
model unless noted; the threshold formula was separately confirmed on a 1M-window model.

## Matrix

| # | Pinned finding | Evidence |
|---|---|---|
| Q1 | `E = min(W, window) − min(maxOutput, 20000)`, `T = E − 13000`. Fires only when the window source is not `auto`. The 1M model defaults to `T = 967000`. `W < 100000` is ignored. A change to `W` mid-session is detected but not applied. | debug `effectiveWindow`; fired `preTokens` 1–5% above predicted `T` on 8 boundaries |
| Q2 | Every spawn inherits `W` unchanged, and sub-agents compact between tool calls | 0 main / 3 sub-agent boundaries |
| Q3 | `PreCompact` → summary call → `SessionStart(source=compact)` → `PostCompact`. All three fire on auto compaction and on a **sub-agent's** compaction. The payload is identical to the main session's: same `session_id`, main `transcript_path`, `cwd`, no agent field, no agent env var. | payload dumps |
| Q4 | `SessionStart[compact]` stdout reaches the model (in the sub-agent's context for a sub-agent compaction). `PostCompact` stdout does not. | marker echoed / absent |
| Q5 | `PreCompact` exit-0 stdout is appended to the summariser's instructions, including in sub-agents | marker present in 2/2 summaries |
| Q6 | The summary copies user messages verbatim and re-attaches recently Read files. Facts that came from a tool result: 4 kept / 1 distorted / 1 lost from the summary alone, 6/6 exact with a ledger-reinjecting hook. | scoring table |
| Q7 | The summary call costs 12–21k equiv at 25–67k pre-context and is **absent from the transcript**. `compactMetadata` = `trigger, preTokens, postTokens, cumulativeDroppedTokens, durationMs, preservedMessages, preservedSegment`. | `modelUsage − transcript sum` = the summary calls exactly |
| Q8 | No model-reachable route triggers `/compact` | route table below |
| C-H3 | Concurrent single-line appends to one ledger both survived | parallel-phase concurrency probe |

## Fire point pins

Checked at every query start (before each API call, including between tool calls) against
the last API usage plus roughly `chars/4` of the newer messages.

| `autoCompactWindow` | PCT override | predicted `T` | fired at `preTokens` |
|---|---|---|---|
| 100000 | — | 67000 | 67454 |
| 100000 | 30 | 24000 | 24715, 24707 |
| 100000 | 50 | 40000 | 41895, 41840, 41684, 41711 |
| 150000 | 30 | 39000 | 39827 |
| unset, 1M-window model | — | 967000 | not reached in probes; confirmed via debug `effectiveWindow=980000` |
| unset, 200k-window model | 20 | (36000 if active) | never fired — the window source was `auto`, which skips the proactive check |
| 60000 | — | — | never fired — a value under the 100000 floor is silently ignored |
| 150000 → 100000 mid-session | — | — | the change is detected (a settings-changed log line) but not applied; `effectiveWindow` kept reflecting the original value |

One recorded session at 761k context on a 1M-window model never compacted, because that
model resolves to `T = 967000` regardless of the smaller windows probed elsewhere.

## Hook payload shapes

```json
{"session_id":"<sid>","transcript_path":"<proj>/<sid>.jsonl","cwd":"<cwd>","prompt_id":"<pid>","hook_event_name":"PreCompact","trigger":"auto","custom_instructions":null}
{"session_id":"<sid>","transcript_path":"<proj>/<sid>.jsonl","cwd":"<cwd>","prompt_id":"<pid>","hook_event_name":"SessionStart","source":"compact","model":"<model-id>"}
{"session_id":"<sid>","transcript_path":"<proj>/<sid>.jsonl","cwd":"<cwd>","prompt_id":"<pid>","hook_event_name":"PostCompact","trigger":"auto","compact_summary":"<summary text>"}
```

Timing on one probe: `PreCompact` fired, the summary call started immediately after, and the
boundary was written to the transcript about 14 seconds later, right after `SessionStart`
and `PostCompact` fired back to back. `SessionStart[startup]` carries no `model` /
`prompt_id`, unlike `SessionStart[compact]`.

Every field above is identical for a **sub-agent's** compaction: same `session_id`, the
**main** session's `transcript_path`, no agent discriminator anywhere in the payload or in
the hook's environment. Confirmation used a distinct `<nonce>` printed by each hook body:
a sub-agent's `SessionStart[compact]` printed its own `<nonce>`, and grepping the stored
transcript for it confirmed the sub-agent's compaction never leaked a marker into the main
session's context.

## Survival scoring

| fact source | hook | 6-item recall | summary text alone |
|---|---|---|---|
| user message | none | 5/6 kept, 1 distorted (a decision detail lost) | 6/6 — copied verbatim into the summary's "user messages" section |
| user message | ledger-reinjecting `SessionStart[compact]` | 6/6 exact | — |
| Read tool result | none | 6/6 exact (two gaps recovered via a re-attached file) | 4/6 kept, 1 distorted, 1 lost |
| Read tool result | ledger-reinjecting `SessionStart[compact]` | 6/6 exact | — |

Caveat: this was synthetic — the six facts were the only signal amid filler text. A long
orchestrator context competes harder for summary space, and its own ledger is read via a
`tail` shell call, which is not the kind of attachment that gets re-sent after compaction.
The hook is the only channel among the three that does not depend on luck.

## Summary-call cost

| `preTokens` at boundary | `postTokens` | summary-call equiv | first post-compaction call cache-create | total equiv |
|---|---|---|---|---|
| 24715 | 2798 | 12425 | 4031 | 17464 |
| 24707 | 3181 | 18110 | 4359 | 23559 |
| 41895 | 2915 | 20582 | 4266 | 25915 |
| 39827 | 3006 | 16534 | 4367 | 21992 |
| 67454 | 3714 | 20015 | 5234 | 26558 |

Per compaction: the summary call costs 12–21k equiv (input 3.0–5.5k, output 1.3–2.6k,
cache-read roughly the whole pre-compaction context) plus the first post-compaction call's
cache-creation (4.0–5.2k) — 17–27k equiv total at 25–67k pre-context. The summary call's
usage never appears in the transcript itself; it is visible only in the session result's
aggregated usage and, if the session runs with debug logging, in the debug log. Extrapolated
(not measured) to a 200k pre-context: roughly 50–75k equiv per compaction.

## Model-triggered compaction routes

Spike 2's conclusion: **no route found**, in CLI 2.1.278.

| route tried | result |
|---|---|
| a skill call requesting compaction | no — rejected as a built-in CLI command, not a skill |
| a hook output field requesting compaction | no — no such field exists in any hook output schema |
| lowering `autoCompactWindow` at an event | no — the change is detected but not applied mid-session |
| typing `/compact` via a terminal-injection tool | not pursued — blocked by the isolation harness itself, and it would bypass the user's own input channel anyway |
| a cross-session message carrying `/compact` text | no — the receiving session reads it as literal text |
| a scheduled one-shot job delivering `/compact` text, headless | no — delivered as a literal user message; the model replied it has no such command |
| a scheduled one-shot job delivering `/compact` text, interactive | no — same outcome; zero compaction boundaries recorded |
| auto-resume after a model-triggered compaction | untested — no model-triggered compaction ever existed to resume from |

Every model-reachable path delivers `/compact` as literal text; only genuine human input (or
an SDK host's own user message) executes it as a command.

## Pinned while designing

| # | Behaviour | Evidence |
|---|---|---|
| P1 | `git rev-parse --path-format=absolute --git-common-dir` returns the **main** checkout's `.git` from the checkout, from a linked worktree and from a worktree subdirectory. It exits 128 outside a repo. | git 2.55, mktemp throwaway |
| P2 | A Bash call's stdout is stored verbatim in the session transcript as a `type:"user"` line carrying a `tool_result` block (and the command text as a `tool_use` block) | this design session's transcript, CLI 2.1.278 |
| P3 | Boundary line: `type:"system"`, `subtype:"compact_boundary"`, `compactMetadata{…}`, plus `agentId`/`isSidechain` in a sub-agent transcript. The summary is a **separate** later line (+3 in every sample, after `session_context` and `date` attachments): `type:"user"`, `isCompactSummary:true`, `message.content` a string, no `usage`. `chars/4` of that string reproduces the measured summary-token figures (e.g. 3,380 chars → 845). | 10 boundaries in 7 probe transcripts, keys only |
| P4 | Manual `/compact <text>`: `PreCompact` fires with `trigger:"manual"` and `custom_instructions` = `<text>`. Registrations with matcher `manual`, `""`, `auto\|manual` or no matcher fire; matcher `auto` does not. `SessionStart[compact]` fires too. Hook stdout and the user's text both reach the summary; the boundary's `trigger` is `manual`. A matcher of `""` fired on both triggers, so `""` is pinned for either. | five registrations on one session; marker and user fact in the summary |
| P5 | A `PreCompact` hook exiting 2 **blocks** the compaction (no boundary; the CLI prints "Compaction blocked by PreCompact hook"). Exit 1 does not block. | one session per exit code |

## Live smoke (2026-10-11)

**All checks hold** — CLI 2.1.296, one throwaway session, run on demand, never gated in CI.

**Setup.** The session ran in a throwaway git repository. Its project settings did one thing:
enable the installed craft plugin. User and local settings were not loaded, so no settings hook
existed anywhere. It was launched headless with `--settings '{"autoCompactWindow":100000}'` on
the small-tier model and driven one user message per turn. The debug log reads
`effectiveWindow=80000` and `thresholdSource=settings`, so `T = 67000`. First, the model ran
`run-ledger.sh open` and three phase events: `design` started, `design` done, `implementation`
started. Then the operator, never the model, appended a ledger line carrying a `<nonce>`. A
second `<nonce>` was appended the same way before the sub-agent step. Neither nonce had any way
into a model's context except the reorient hook's ledger tail.

**Sequence.**

1. Filler turns until an automatic compaction (`preTokens` 75467).
2. A question answered from context only.
3. One general-purpose sub-agent read 14 filler files. It compacted automatically twice
   (`preTokens` 72456 and 71219).
4. A manual `/compact`, sent as a plain user message (`preTokens` 34793).
5. The same question again.

| check | result | evidence |
|---|---|---|
| the plugin-registered `SessionStart[compact]` fired | yes, 4/4 compactions (main auto, main manual, sub-agent ×2) | One debug line per compaction: `Hooks: SessionStart:compact [${CRAFT_ROOT:-<plugin-root>}/hooks/reorient-after-compact.sh] (plugin craft@<marketplace>) finished with status 0`, 129–243 ms. Each summary is followed by a `hook_success` attachment named `SessionStart:compact`. `PreCompact:auto` and `PreCompact:manual` ran the plugin's `steer-compact-summary.sh` with status 0, 4/4 |
| its block reached the model | yes | After the automatic compaction, asked for every marker token in its context, the main session returned the ledger `<nonce>` and attributed it to the hook output. After the manual compaction it returned both `<nonce>`s |
| the transcript binding held | yes | The run-key that `open` printed appears verbatim, once, in the main transcript, inside the stored output of the shell call. `run-ledger.sh locate --transcript` on that transcript returns the run-id and its ledger. The hook prints its block only when bound, and it printed it every time |
| a sub-agent's compaction got the guard | yes | For both sub-agent compactions, the hook block, guard paragraph first, landed in the sub-agent's transcript and not the main one. The sub-agent read only its files, never ran the rebuild, and reported both `<nonce>`s as found "only in the SessionStart craft hook text" |
| the main summary keeps run-id, ledger path, in-flight phase | yes | Automatic: the run-id and the ledger path verbatim, and the anchor sentence "The run ledger outranks this summary." verbatim. The phase is paraphrased, not in the steer's `phase(s) in flight:` wording: "The implementation phase has started but has not been marked done". Manual: the run-id, the ledger path, "in-flight phase `implementation`", and the anchor sentence |
| a sub-agent summary keeps its task and no ledger path | yes | Both summaries open with the spawn prompt's task, near-verbatim, and neither holds a ledger path. The first also omits the run-id. The second names the run-id once, in a description of the reorient text it had received ("apply only to the craft orchestrator running" the run; "this agent is not that orchestrator, so those steps were ignored"), never as a run anchor |
| a manual `/compact` is steered | yes | `PreCompact:manual` ran the steer hook, the boundary reads `trigger: manual`, and the summary keeps all three main-session anchors |

**Closed assumptions.**

- **Plugin vs settings hook.** Registration does not change behaviour. The order matches the
  settings-hook spike (`PreCompact` → summary call → `SessionStart[compact]` → boundary).
  Stdout reaches the model. A sub-agent's hook output stays in the sub-agent's context.
- **Key in transcript.** It holds on a real main session, not only in a probe harness.
- **Which paragraph.** Each summariser applied its own paragraph: orchestrator for the main
  session, sub-agent for the sub-agent. The one drift is that the automatic summary
  paraphrases the in-flight phase instead of keeping the steer's wording.

A headless driver's `/compact` user message runs a real manual compaction. Spike 2 had left
this as a static read.

**Observed outside the hooks.** After the manual compaction, the CLI re-appended an earlier
stretch of the main transcript, including the automatic boundary and its summary, with the
same `uuid`s. A count of boundary lines therefore reads three compactions where two happened.
