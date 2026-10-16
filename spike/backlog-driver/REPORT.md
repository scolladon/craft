# Spike — unattended backlog driver

Date 2026-10-16 · claude 2.1.301 · tmux 3.8 · Opus 5.5 (driven sessions) · Haiku 5.5 (probes).
Learning-only branch (`feat/unattended-backlog-driver-spike`), not merged. Every claim below cites
a recorded run under `evidence/`. Times are UTC (Paris = UTC+2).

## Recommendation

**Use (b): an interactive session in tmux, driven by `driver.sh`.** It ran two real backlog
entries end to end, with both PRs merged and CI green:

- no keystroke from a person;
- a SIGKILL of the driven session in the middle of a run, recovered;
- a kill and restart of the driver itself, recovered.

Keep (a) `claude -p` as the fallback for machines with no person attached. Asks there are
invisible to exit codes, so the same status-file contract is mandatory, and the answer goes back
through `claude -p --resume <id>`.

The cost is the run itself: the driver spends **0 model tokens**, and a hand-off takes **13 s**.

```
driver.sh ──tmux new-session──▶ claude (interactive, --settings driver hooks + outward guard)
   ▲  │ send-keys: /craft:run --policy push/propose/integrate/teardown=always <entry-N.brief.md>
   │  └ send-keys: /clear (between entries) · claude --resume <sid> + rebuild prompt (after a kill)
   │
   └── polls: events.jsonl (SessionStart/Stop/PermissionRequest/Notification hook payloads)
              entry-N.status  ("FINISHED <pr>" | "BLOCKED <reason>", written by the run, last action)
              entry-N.started (event mark — makes the driver restartable)
```

## The attended loop (two real entries)

| | entry 1 — gpg fixture flake | entry 2 — codex title fix |
|---|---|---|
| PR | #67 → `6114371` (+ `8a78edf` metrics) | #68 → `a310f8b` (+ `07437ff` metrics) |
| started → FINISHED (driver) | 08:13:43 → 08:47:17 = **33.6 min** | 08:47:30 → 09:05:51 = **18.4 min** |
| hand-off gap (FINISHED → next `/craft:run`, incl. `/clear`) | — | **13 s** |
| status written → driver detected | 08:47:16 → 08:47:17 (1 s) | 09:05:48 → 09:05:51 (3 s) |
| asks / permission prompts | 0 / 0 | 0 / 0 |
| kills survived | driver killed 08:34:36, restarted 08:34:47, adopted the live session | session SIGKILLed 08:56:15, resumed 08:56:17 |
| equiv tokens: main thread / sub-agents (7 each) | 1,996,987 / 793,241 = **2,790,228** | 1,141,914 / 338,218 = **1,480,132** |

`measure-loop.py` derives the sub-agent totals from the transcripts. Craft's own committed
`.claude/craft-metrics.md` rows for these runs give 793,242 and 338,218, an independent match.
**The main thread is 72% and 77% of the spend**, the same finding as the 2026-09-21
headless-loop spike: orchestrator context dominates.

Phase durations, in minutes, from the ledger snapshots (`evidence/loop/ledgers/`):

| phase | workspace | design | decisions | planning | implementation | review | refactoring | documentation | propose | integrate |
|---|---|---|---|---|---|---|---|---|---|---|
| entry 1 | 1.9 | 10.4 | 0.1 | 6.8 | 2.9 | 4.8 | 0.9 | 0.8 | 0.3 | 3.5 |
| entry 2 | 0.2 | 3.7 | auto-skip | 2.7 | 2.4 (kill) | 2.0 | 0.1 | 2.4 | 0.2 | 3.8 |

For both one-line-sized fixes, design + planning take about half the wall-clock. Integrate is
mostly waiting for CI.

## Open questions — answered

| Question | Answer | Evidence |
|---|---|---|
| What does a headless run do at a decisions-phase question? | Asks in **prose** and exits `subtype: success, is_error: false, permission_denials: []`. Nothing is written or committed. AskUserQuestion is **not in the `-p` tool set**, even when listed in `--allowedTools`. | `a2-craft-decisions-headless.jsonl` (07:58:01–07:58:16), `a1-askuserquestion-headless.jsonl` |
| …and how does the answer get back? | `claude -p --resume <session_id> "(a) plain text."` continued the run: ADR-001 was written and committed. | `a2-resume-answer.jsonl` (commit `380f436` in the fixture) |
| How does the driver tell "asked" from "finished"? | Never from exit codes or `Stop` alone. **Finished = the run's status file + a `Stop`.** In tmux, a pending AskUserQuestion fires `PermissionRequest(tool_name=AskUserQuestion)` at once, then `Notification(permission_prompt)` about 6 s later, and **no `Stop`**. A `Stop` with no status file and empty `background_tasks` is a prose ask. | `b1/`, `smoke/state/events.jsonl` (08:11:11 PermissionRequest, 08:11:17 Notification) |
| Is `Stop` = idle? | **No.** In the real loop, 14 of 16 `Stop` events fired mid-run while the orchestrator waited on a background sub-agent (e.g. 08:17:27, `background_tasks: [craft:designer running]`). A naive Stop-triggered `/clear` would have killed run 1 four minutes in. `background_tasks` in the payload is what separates the two. | `loop/state/events.jsonl` |
| Paid-eval ask? | Not exercised: neither entry needed one. It travels the same channel as any ask (AskUserQuestion → `PermissionRequest`), which `smoke/` proves end to end. A paid-eval-specific run is unproven. | `smoke/` |
| How is the person notified? | `osascript display notification` (sound "Glass") + `tmux display-message` + the driver log, on ask, permission, resume and stop. It returned 0 for every call (no `notify: osascript failed` line). Delivery to the screen was not verified by the spike. | `loop/state/driver.log` |
| Pre-approval without trusting the model? | Two layers. The soft one is craft's own `--policy <action>=always` (ADR-130). The hard one is `outward-guard.mjs`, a PreToolUse hook that parses argv with craft's tokeniser and **denies `git push` / `gh pr create` / `gh pr merge` unless the brief carries `PREAPPROVED:`**. Live: denied without the token, pushed with it. | `a3/no-token.jsonl`, `a3/token.jsonl`, `a3/remote-branches.txt` |
| Stop conditions | **Empty queue:** exit 0, recorded. **Budget cap:** checked before every entry (4.25M of 30M spent). **Resume cap:** 2 per entry. **Blocker / CI red after one fix round:** the run writes `BLOCKED …`; classifier unit tests cover it, but no real run blocked, so this path is unproven live. | `loop/state/driver.log`, `test/test_classify.py` |

## Resilience — "if the session is killed it resumes cleanly"

| Kill | What happened | Evidence |
|---|---|---|
| driver process killed mid-entry-1 | Restarted 11 s later. It read `entry-1.started`, adopted the live tmux session and kept awaiting. The run never noticed. | `loop/driver-kill.log`, `loop/state/driver.log` 08:34:47 |
| driven claude SIGKILLed 60 s into entry 2 implementation | Detected in 2 s (tmux session gone). Relaunched with `claude --resume <sid>`: `SessionStart source=resume`, same session id. The in-flight part-implementer was reported as "didn't finish before the previous session ended". After the rebuild prompt, the orchestrator rebuilt from the ledger, found part commit `46ca8f4`, re-ran the gate and continued to review. PR #68 merged. | `loop/session-kill.log`, `loop/state/events.jsonl`, transcript `3451f8e5…` |
| toy session SIGKILLed during a 90 s Bash | Resumed. The interrupted Bash showed as "Interrupted", the model redid the step, FINISHED. | `resume-smoke/` |

Resume cost: the first post-resume call read **104,647 tokens from cache**, plus 1,041 creation,
because the kill-to-resume gap (2 s) was inside the cache TTL. A resume after the TTL would pay
~105k × 1.25 cache creation. That is still small against a 1.5M entry.

**Limit:** the session kill landed 26 s *after* the part's commit (`46ca8f4` @ 08:55:49). A kill
mid-edit, before a commit, would leave a dirty worktree. Craft's rebuild rule ("a landed commit
without a PART line is verified") does not cover uncommitted edits, so that case is **unproven**.

## Traps found (each reproduced)

1. **Trust dialog defaults to "No, exit"**: Enter kills a fresh-dir session. The driver refuses
   untrusted dirs unless `DRIVER_TRUST_NEW_DIR=1`, which sends Down+Enter. — `b1-try1-trust-default-exit/pane-01-launch.txt`
2. **`${DRIVER_COMMAND:-… {brief}}` closes at the first `}`**: a custom template got a stray `}`
   appended to the brief path. It is fixed by a separate default variable. — `resume-smoke/pane-after-resume.txt`
3. **The run's elected next prompt carried the `--policy …=always` flags forward.** A driver that
   pastes an election verbatim would extend pre-approval to an entry the person never approved.
   The driver must own approval and strip it from elections. — `loop/state/entry-1.next-elected.md`
4. **Scoped `--allowedTools` denies compound commands.** In `-p`, `cat …; ls …` is not matched by
   `Bash(cat:*)` and is denied; the model recovered. — `a2-resume-answer.jsonl` `permission_denials`
5. `claude -p` stdin wait: pass `< /dev/null` (carried from the 2026-09-21 spike).

## (a) vs (b)

| | (a) `claude -p` per entry | (b) tmux interactive |
|---|---|---|
| ask | prose + `success` exit; detect by missing status file; answer through `--resume` | native AskUserQuestion; `PermissionRequest` hook; person attaches |
| permission prompts | denied, never hang, per `claude --help` for `--permission-prompts none` (unprobed) | the person answers by attaching (auto mode gave 0 prompts in 2 runs) |
| settings | `--allowedTools` required (project allowlist ignored when untrusted) | the person's own settings + auto mode |
| kill recovery | `--resume <id>` (the same mechanism, proven for answers) | proven: adopt or `--resume` |
| first-call context floor | ≈21k (2026-09-21 spike) | not measured here |
| full `/craft:run` per entry | **not run by this spike** | 2 real runs, merged |

## Unproven — and how to prove it

- **Kill mid-uncommitted-edit.** SIGKILL while a part-implementer has written but not committed;
  check whether the rebuild resets or reuses the dirty tree.
- **BLOCKED and CI-red stops, live.** Feed an entry whose CI fails twice; check that
  `BLOCKED ci-red-after-one-fix-round` stops the loop with a notification.
- **A full `/craft:run` under (a).** One small entry headless with `--permission-prompts none`;
  compare its equiv and wall-clock with the table above.
- **`claude --bg` / `claude attach` (2.1.301).** A native background session might replace tmux;
  probe whether hooks and `/clear` behave the same.
- **Budget is enforced between entries only.** An in-run overrun is unbounded. Check it per poll
  and send Escape to stop.

## Files

`driver.sh` (loop) · `hook-event.sh` + `driver-settings.sh` (hook recorders) · `classify.py`
(verdicts) · `outward-guard.mjs` (hard pre-approval floor, reuses `engine/src/guards`) ·
`budget.py` / `measure-loop.py` (tokens and time) · `driver-protocol.md` (the brief's contract) ·
`queue/` (the two briefs) · `probes/` · `test/` (guard 10/10, classifier 9/9) · `evidence/`.

Run it: `DRIVER_BUDGET_EQUIV=30000000 spike/backlog-driver/driver.sh <repo> <queue-dir> <state-dir>`,
then `tmux attach -t craft-driver` to watch or answer.
