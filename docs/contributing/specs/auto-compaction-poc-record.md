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

## Live smoke (pending)

Not yet run. When it runs, it is recorded here, not gated in CI.

A throwaway session launched with `--settings '{"autoCompactWindow":100000}'` and the
plugin installed as a real plugin (not injected as a settings hook) opens a run ledger and
fills context until an automatic compaction fires. It checks:

- the plugin-registered reorient hook fired (not just a settings-injected one)
- the block reached the model — confirmed by asking for a marker only the hook could have
  printed
- the transcript binding held on a real main session, not only in a probe harness
- a sub-agent's compaction during the run also received the guard
- reading each `isCompactSummary` line from the steer hook: the main session's summary holds
  the run-id, ledger path and in-flight phase; a sub-agent's holds its task statement and no
  ledger path; a manual `/compact` is steered the same way

It closes three assumptions the probes above could not: plugin-registration versus
settings-hook parity, key-in-transcript behaviour on a real (non-probe) main session, and
which of the steer hook's candidate paragraphs reads best in practice.
