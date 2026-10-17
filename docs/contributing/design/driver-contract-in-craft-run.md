# Design — driver-contract-in-craft-run

> Brief: an outside driver learns that a run finished only from a status file the run writes as
> its last action, and it needs the next-item election in a file, not in chat. Today every driven
> brief asks for both by hand. Fix: when a driver env var names a state dir, `craft:run` writes
> `FINISHED <pr>` / `BLOCKED <reason>` and the election there, and strips `--policy` flags from the
> elected prompt. The workspace phase enters its worktree in a background session without a prompt.
> Status: draft → self-reviewed ×3

## Context

**Who owns what today.**

| Concern | Owner today | Where |
|---|---|---|
| Status file (`FINISHED`/`BLOCKED`) | the driver's brief, re-stated per entry | spike `spike/backlog-driver/driver-protocol-bg.md` (branch `feat/unattended-backlog-driver-spike`, learning-only, never merged) |
| Next-item election + ready-to-paste prompt | the **user's** global instructions (outside this repo), handed over in chat | nothing in `skills/` elects; `grep -rn elect skills/` finds no election step |
| End of run | `skills/run/SKILL.md` §Done (`:557-608`): memory `save` → `emit-metrics.sh` → `run-ledger.sh close` ("the last action") → final message | — |
| Pre-approval | per-invocation `--policy <action>=always` (ADR-130), parsed by §0 step 0a (`:19-34`), forwarded to `pipeline-resolve.js` (`parsePolicyToken`, `engine/src/pipeline-resolve-main.js:89`) | `engine/src/policy.js` `POLICY_ACTIONS`, `VERDICTS = ['always','ask','never']` |
| Worktree | `skills/workspace/SKILL.md` step 2: `git worktree add ../<repo>-<slug> -b <type>/<slug> && worktree-setup.sh <abs>`; step 5 "All subsequent work happens ONLY in this worktree/branch" | — |
| Terminal stops | §0 STOPs (`:30,44,51,69,70,119,155`), walk error paths (`:385-395`), workspace collision STOP (step 3), the blocker escalation (walk step 8, `:373`; invariant `:487`) | — |

Every binding's run shim (`adapters/copilot/commands/craft-run.md`, `adapters/codex/…/craft-run/SKILL.md`,
cursor, opencode, pi, antigravity) follows `skills/run/SKILL.md` verbatim, so a contract written
there reaches every binding. Only the `EnterWorktree` half is Claude-binding specific.

**Driver side as the spike built it** (`spike/backlog-driver/driver-bg.sh` on the spike branch):

- renders `{{STATE}}`/`{{N}}` into each entry's brief, so the run only knows `N` because the brief says so;
- polls `entry-N.status`, reads the verb with `head -1 | cut -d' ' -f1`; `FINISHED` → verifies the PR
  is merged (`gh pr view --json state`) or stops with exit 6; `BLOCKED` → stops the loop (exit 2);
- on a re-run, an entry with a status file is skipped (`FINISHED`) or refused until the person clears it (`BLOCKED`);
- launches each entry as `claude --bg` with `/craft:run --policy push=always --policy propose=always --policy integrate=always --policy teardown=always <brief>`,
  and backs that soft layer with a hard PreToolUse guard (`outward-guard.mjs`, `PREAPPROVED:` line);
- answers the `EnterWorktree` permission prompt with a `PermissionRequest` hook (`worktree-approver.mjs`)
  that allows only a git-registered sibling `<repo>-<slug>` whose path has no symlink on it.

**Pinned evidence (no claim below is from memory).**

*E1 — the policy leak.* Spike `evidence/loop/state/entry-1.next-elected.md`: the ready-to-paste
prompt opens `/craft:run --policy push=always --policy propose=always --policy integrate=always --policy teardown=always Compose the …`.
Pasting it pre-approves push/PR/merge/teardown for an entry nobody approved.

*E2 — background-session behaviour, live* (spike `bg-loop2`, entry 1 = PR #70's run, CLI 2.1.301,
`permission_mode: auto`; transcript rows by index, events in `evidence/bg-loop2/state/events.jsonl`):

| Action in the `--bg` session (cwd = the shared checkout) | Result |
|---|---|
| Bash `git worktree add ../craft-<slug> … && worktree-setup.sh …` | ran, exit 0 — Bash is not stopped by the isolation guard |
| `EnterWorktree {path: ../<repo>-<slug>}` (sibling, absolute in the payload) | `PermissionRequest` raised (13:26:38); the driver's hook allowed it |
| `Edit` of `test/memory-store.test.js` in the shared checkout | denied: "This background session hasn't isolated its changes yet. Call EnterWorktree first … (a path inside a linked git worktree, including one you create with `git worktree add`, is accepted). (To disable this guard for this repo, set `"worktree": {"bgIsolation": "none"}` in .claude/settings.json.)" |
| `Write` of the election into a state dir **inside** the shared checkout (`.claude/driver-state-bg2/`) | denied, same message |
| `Write` of the same election into the session's job tmp dir (outside the checkout) | succeeded |
| Bash `cp <job-tmp>/entry-1.next-elected.md <state-dir>/` and `printf 'FINISHED …' > <state-dir>/entry-1.status` | succeeded — the driver saw `FINISHED https://github.com/scolladon/craft/pull/70` |
| Bash `node … memory-save` / `emit-metrics.sh` writing `.claude/craft-*.md` in the shared checkout | succeeded |
| the Edit above, retried | the model built a second worktree (`craft-bookkeeping-<slug>`) and called `EnterWorktree` on it → a second `PermissionRequest` (14:42:01) |

So under `--bg`: Bash writes anywhere pass; `Write`/`Edit` into the shared checkout are refused;
the only prompts came from the session's own `EnterWorktree` calls on sibling paths.

*E3 — `EnterWorktree` permission logic, static* (strings of the installed CLI bundle, 2.1.302;
read, not executed):

```js
async checkPermissions(r){
  if(!r.path) return {behavior:"allow", …}              // `name` / no arg: create under .claude/worktrees/
  let n = await mco(r.path)
  if(n?.managed) return {behavior:"allow", …}            // path strictly under <repo>/.claude/worktrees/
  return {behavior:"ask", message:`Enter the worktree at "…"? This moves the session's working directory and write access there, …`,
          decisionReason:{type:"safetyCheck", reason:`permission-root relocation to "…" — a model-supplied worktree outside .claude/worktrees/`,
          classifierApprovable:false}}
```

| `EnterWorktree` input | Decision | Auto mode can approve? |
|---|---|---|
| no arg / `name` (creates `.claude/worktrees/<name>` on a new branch; base ref from setting `worktree.baseRef`, default `fresh` = `origin/<default>`) | allow | n/a |
| `path` strictly under `<repo>/.claude/worktrees/` (location-based "managed") | allow | n/a |
| `path` anywhere else (craft's `../<repo>-<slug>`) | ask | **no** (`classifierApprovable:false`) — needs a person or a hook |

*E4 — the edit guard, static (same bundle).* The guard returns "no objection" when the edit target is
**not inside the session's checkout** (minified: `if(!QRe(target, cwdCheckout)) return null`). A sibling
`../<repo>-<slug>/…` is outside it, so an `Edit`/`Write` there should pass **without** `EnterWorktree`.
Knobs seen: env `CLAUDE_BG_ISOLATION` (`worktree`|`none`), setting `worktree.bgIsolation`, and
`CLAUDE_CODE_SESSION_KIND=bg` marks a background session. **Unproven live** — see Test strategy P2.

*E5 — nested worktree noise* (probed 2026-10-17 in a mktemp repo, git 2.54.0):
`git worktree add .claude/worktrees/demo -b feat/demo` → the main checkout's `git status --porcelain`
shows `?? .claude/worktrees/demo/`. This repo's `.gitignore` has no `.claude/worktrees` entry.

*E6 — env propagation into `claude --bg`: unproven.* The spike passed state to hooks with
`env DRIVER_STATE=… <hook>` inside the hook command string and to the run through the rendered
brief; no evidence shows a variable set in the launcher's environment reaching the session's Bash.
`--bg` hands the session to a supervisor (the spike's SIGKILL test was resumed by it with no driver
action), so the launcher's env may not be the session's. See Test strategy P1.

**Self-hosting.** Under the worktree strategy, the plugin that runs is the main checkout, so the run
that builds this change still runs today's skills (clean "before" baseline).

## Requirements

- **R1 — Opt-in, zero drift.** With `CRAFT_DRIVER_STATE` unset or empty, a run behaves exactly as
  today: no file written, no election by craft, §Done unchanged in effect.
- **R2 — Finished.** In a driven run that merged its PR, after `run-ledger.sh close`, the run writes
  the election (when it has one) and then the status file holding exactly one line
  `FINISHED <merged PR url>`. The status write is the run's last tool call.
- **R3 — Blocked.** In a driven run that ends at a terminal stop, the last tool call writes
  `BLOCKED <phase-id>: <reason>` (one line). A stop mid-walk leaves the ledger open (resumable, same
  as today's STOP). A run that reaches §Done without a merge (DC-8) closes its ledger as today and
  writes `BLOCKED integrate: not merged …` in place of `FINISHED`.
- **R4 — No carried approval.** The written election prompt contains no `--policy` flag token.
  A script enforces this; prose only calls the script.
- **R5 — Atomic.** The driver polls every 1–3 s, so a status or election file is never visible half
  written (temp file in the same dir + `rename`).
- **R6 — Final.** The run never overwrites an existing status file.
- **R7 — No prompt in `--bg`.** The workspace phase raises no permission prompt in a background
  session, with no driver hook installed.
- **R8 — One place.** The contract lives in `skills/run/SKILL.md`, `skills/workspace/SKILL.md`, one
  script and one spec, so every binding that follows the run skill gets it.
- **R9 — Write failure is surfaced, never a blocker** (same posture as a failed ledger append or
  `save`): the run tells the person in-session and finishes.

## Design

### Contract (recommended shape; every load-bearing choice is a candidate below)

```
driver                                   craft:run (driven)
──────                                   ──────────────────
mkdir <state>/entry-7                     driver-state.sh active          → exit 0
CRAFT_DRIVER_STATE=<state>/entry-7 \      … walk …
  claude --bg "/craft:run <brief>"        §Done: save → emit-metrics → close
                                          driver-state.sh finished <pr> \
poll <state>/entry-7/status  ◄──────────     --election next.md --prompt next.prompt   (last call)
  FINISHED <url> → gh verify merged       or, at a terminal stop:
  BLOCKED <phase>: <reason> → stop        driver-state.sh blocked <phase> <reason>     (last call)
```

**State dir layout** (DC-1 a, DC-3 a) — the driver makes one dir per entry; craft never sees `N`:

| File | Writer | Content |
|---|---|---|
| `status` | craft, last | one line: `FINISHED <url>` or `BLOCKED <phase-id>: <reason>`, `\n`-terminated |
| `next.md` | craft, before `status` | election rationale (markdown); the prompt is not repeated here |
| `next.prompt` | craft, before `status` | the ready-to-paste prompt, raw text, `--policy` tokens stripped |
| anything else (`started`, logs) | the driver | craft never reads or writes it |

**Status grammar** (enforced by the script, so the driver can split on the first space):

```
status   = finished | blocked
finished = "FINISHED " url            url   = ^https?://\S+$
blocked  = "BLOCKED " phase ": " reason   phase = ^[a-z][a-z0-9-]*$
reason   = 1..240 chars, whitespace runs (incl. newlines) collapsed to one space, trimmed
```

`FINISHED` means **merged** (the spike driver already verifies that). A run whose PR exists but was
not merged — `integrate` resolved to `never`, the merge ask declined, or no remote — writes
`BLOCKED integrate: not merged <pr-url-or-branch>` (DC-8 a).

### The script — `scripts/driver-state.sh` → `engine/bin/driver-state.js` (DC-10 a)

Same split as `emit-metrics.sh`/`metrics-emit.js` and `run-state.js`/`run-state-main.js`: a thin
shell wrapper, a bin that only wires io, a `*-main.js` for argv + filesystem, and a pure module that
Stryker mutates.

```
driver-state.sh active
    exit 0 + prints the dir   CRAFT_DRIVER_STATE is an absolute path to an existing writable dir
    exit 1                    unset or empty (not driven)
    exit 2 + stderr           set but relative / missing / not a dir / not writable
driver-state.sh finished <pr-url> [--election <md-file> --prompt <prompt-file>]
driver-state.sh blocked <phase-id> <reason…>
    exit 0   written
    exit 2   not driven / bad env / bad grammar (url, phase, empty reason) — writes nothing
    exit 3   prompt still holds a --policy token after stripping — writes nothing
    exit 4   status already exists — writes nothing
```

`finished` is all-or-nothing per call and orders its writes `next.md` → `next.prompt` → `status`, each
through `<file>.tmp.<pid>` + `renameSync` in the state dir. The existence check for `status` uses
`lstat`, so a symlink planted at `status` also counts as existing (exit 4); a rename over a symlink at
`next.*` replaces the link, never its target. `--election` and `--prompt` come as a pair
or not at all. On exit 3 the orchestrator re-runs `finished <pr-url>` without the election and says
in its final message that the election was withheld and why.

**Pure module `engine/src/driver-state.js`:**

```js
export const STATUS_VERBS = Object.freeze(['FINISHED', 'BLOCKED']);
export const MAX_REASON_CHARS = 240;
export function stripPolicyFlags(prompt)        // → { prompt: string, leftovers: string[] }
export function finishedLine(prUrl)             // → { line } | { error }
export function blockedLine(phaseId, reason)    // → { line } | { error }
```

`stripPolicyFlags` (DC-4 a, DC-5 a) tokenises on whitespace while keeping the separators, so the
rest of the prompt is preserved byte for byte:

| Input fragment | Output |
|---|---|
| `--policy push=always ` (bare flag + a value holding `=`) | both tokens removed, with the whitespace after each |
| `--policy is mentioned` (next token holds no `=`) | only `--policy` removed; `is` is prose, not a value |
| `--policy=push=always` (single token) | removed |
| `--policy integrate=never`, `--policy push=ask` | removed (any verdict) |
| `--policy` as the last token (no value) | removed |
| `` `--policy …=always` `` in prose (backticks/quotes around it) | kept — not a bare flag token |
| `--skip review`, `--profile lean`, `--harness …`, `--config x` | kept (DC-4) |
| `--policy` inside a multi-line prompt, any line | removed (0a reads flags anywhere in the input) |

Post-condition: no bare `--policy` / `--policy=…` token remains; otherwise `leftovers` is non-empty and
`main` exits 3. Idempotent: `strip(strip(x)) === strip(x)`.

### `skills/run/SKILL.md`

1. **§0, new step 0-driver (before 0a).** Run `driver-state.sh active`; exit 2 → surface stderr and
   continue undriven (R9 posture: a broken env must not stop a run the person may be watching).
   Nothing is held in session state: every later use re-probes, so a compaction or a `--resume`
   loses nothing.
2. **Cross-phase invariant "Driven stop"** (DC-6 a, DC-7 a). When the run is about to end its turn at
   a terminal stop — any STOP in §0 or the walk error paths, the workspace collision STOP, an
   escalation the person declined or left with no way forward, a `degrade-to-blocker` policy surface
   — its last tool call is
   `driver-state.sh active >/dev/null && driver-state.sh blocked <phase-id> "<reason>"`.
   An escalation is still asked first (`AskUserQuestion`; the driver notifies the person); only a
   stop the run cannot continue from writes `BLOCKED`. Every §0 stop uses phase id `resolve`.
3. **§Done, after the `close` paragraph — "Driver hand-off."** When `driver-state.sh active` exits 0:
   elect the next item (item 4 below), write `next.md`/`next.prompt` into a `mktemp -d` dir outside
   the working tree (E2: a `Write` outside the shared checkout passed in `--bg`), then call
   `driver-state.sh finished <pr-url> --election … --prompt …` as the last tool call. When the PR
   was not merged (DC-8), call `driver-state.sh blocked integrate "not merged <pr-or-branch>"`
   instead and write no election. On exit 3, re-run `finished <pr-url>` alone and say in the final
   message that the election was withheld and why. `close` stops being "the last action" and
   becomes "the last ledger action"; the prose says the status write is last and nothing follows it
   but the final message.
4. **Election.** Driven runs only. With `backlog: { source: file }`: the first open entry
   top-down that is unblocked (no unmet dependency, no paid eval, no interactive-only step), with
   the context a cold session needs. `source: custom` has no list operation in the backlog port and
   no `backlog:` means nothing to elect: both write no election, only the status.
5. **Rebuild after compaction, step 2** gains "re-run `driver-state.sh active`" — no ledger token is
   added: the env is the source of truth and `FINISHED` lands after `close`, so a ledger line could
   never record it.

### `skills/workspace/SKILL.md` (DC-9 a)

Step 5 becomes: all subsequent work happens only in the worktree, **reached by its absolute path**
— Bash as `cd <abs-worktree-path> && …`, file tools at `<abs-worktree-path>/…`, agents spawned with
it as their working directory. The session itself is never moved with a working-directory relocation
tool (Claude Code's `EnterWorktree`): for a worktree outside `.claude/worktrees/` it raises a
permission-root prompt that auto mode cannot approve (E3), which blocks a background session; and a
background session's edit guard already accepts edits at the sibling path (E4). The rebuild table's
`workspace` row and `integrate`'s teardown already address the worktree by absolute path; teardown no
longer needs an `ExitWorktree` first.

### `docs/contributing/specs/driver.md` (new)

The driver-facing contract: env var, layout, grammar, write order, exit codes, the merged-only meaning
of `FINISHED`, "re-set the env on `claude --bg --resume`", the leftover risk of DC-5, and the
documented fallback for the `EnterWorktree` prompt (a `PermissionRequest` hook shaped like the
spike's approver) for CLI versions where E4 does not hold.

### Edge behaviour

| Case | Behaviour |
|---|---|
| env set, dir missing | `active` exit 2 → surfaced, run continues undriven; driver times out (its own timeout) |
| status already exists (resume after a manual fix) | exit 4, nothing written; surfaced. The driver protocol already says "clear its status to retry" |
| election prompt holds a quoted `--policy` mention | kept (prose); see DC-5 residual risk |
| no merge (`integrate` = `never`, merge ask declined, `integrate` skipped, no remote) | §Done runs and closes the ledger; status `BLOCKED integrate: not merged <pr-or-branch>`; no election |
| PR merged, then `save`/`emit-metrics` fail | both are warnings today (R9); `FINISHED` still written |
| run killed after `close`, before `status` | no status; driver sees a dead session and resumes it; a resumed run with no open ledger and a merged PR is a rebuild case the resume table does not cover — Out of scope |
| driven run, attended person answers a blocker | no file written; the run continues |
| `strategy: in-place` in `--bg` | unchanged: edits in the shared checkout are refused by the guard (E2) — Out of scope |

### Parts (pre-chewed)

**Part 1 — pure module.** Files: new `engine/src/driver-state.js`, `engine/test/driver-state.test.js`.
Pattern to mirror: `engine/src/policy.js` (frozen exported constants, pure functions, no I/O).
Grammar constants named (no magic values): `URL_RE`, `PHASE_ID_RE`, `MAX_REASON_CHARS`,
`POLICY_FLAG = '--policy'`, `POLICY_FLAG_INLINE_PREFIX = '--policy='`.
RED tests (Given/When/Then, AAA, `sut`): each row of the strip table; idempotence over a seeded
generated corpus (random interleavings of `--policy a=v`, `--policy=a=v`, quoted mentions, other
flags, newlines); `finishedLine` accepts `https://…/pull/70`, rejects empty / spaced / non-URL;
`blockedLine` collapses `"a\n  b"` → `a b`, truncates at 240, rejects empty reason and `Bad-Phase`.

**Part 2 — bin + main + wrapper.** Files: new `engine/src/driver-state-main.js`,
`engine/bin/driver-state.js` (copy `engine/bin/run-state.js`: `isEntryPoint(import.meta)` from
`engine/src/cli-io.js`, `process.exit(main(argv, io))`), `scripts/driver-state.sh` (copy
`scripts/emit-metrics.sh`), tests `engine/test/driver-state-main.test.js` (mkdtemp state dir, env
injected through a `deps.env` object, never `process.env` mutation) and
`engine/test/driver-state.bin.test.js` (spawn, like `config-resolve.bin.test.js`).
RED tests: every exit code row; write order (`status` absent while `next.*` present is never
observable to a reader: assert the `status` file appears last by listing after each injected
`renameSync` through `deps.fs`); no `*.tmp.*` left behind on success or on failure; exit 4 leaves the
existing `status` byte-identical; unset env → `active` exit 1 and `finished` exit 2 with nothing written.

**Part 3 — run skill prose.** File: `skills/run/SKILL.md` — §0 (new step before 0a, `:19`),
"Cross-phase invariants" (new bullet beside **Blockers**, `:487`), §Done (after the `close`
paragraph, `:603-604`), "Rebuild after compaction" step 2 (`:528`). Every call spells the path
as `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/driver-state.sh"`, like the other scripts. Tests: new
`test/driver-contract.test.js` using `sliceProse`/`TO_END` from `test/helpers/region-slice.js`:
§Done names `driver-state.sh finished` after `run-ledger.sh close` (index order inside the region);
the invariants region names `driver-state.sh blocked`; §0 names `driver-state.sh active`; the
election text names `next.prompt` and not `--policy`. Existing pins in `test/run-record.test.js`
(`run-ledger.sh close`, `save(repoRoot, view, delta, deps)`, the buffered-flush sentence) must stay green.

**Part 4 — workspace prose.** File: `skills/workspace/SKILL.md` step 5 (`:41`). Test in
`test/driver-contract.test.js`: step 5 region names "absolute path" and `EnterWorktree` as the tool
never used.

**Part 5 — spec.** File: new `docs/contributing/specs/driver.md`; link it from
`docs/contributing/specs/policy.md` (§Claude binding, one line: pre-approval never travels through
an election). Test: the spec carries the grammar lines and the three exit-code rows.

**ADR impact (for the decisions phase).** ADR-130 says pre-approval is the per-invocation
`--policy …=always` overlay; this change keeps that and adds that an election never carries it
(refines, does not supersede). No ADR fixes `../<repo>-<slug>` as the worktree location for
`EnterWorktree` purposes; ADR-451 only orders the §0 collision check.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Env var + state layout | (a) **`CRAFT_DRIVER_STATE=<per-entry dir>`**, fixed names `status`, `next.md`, `next.prompt`; the driver makes one dir per entry. (b) `CRAFT_DRIVER_STATE=<dir>` + `CRAFT_DRIVER_ENTRY=<N>` → `entry-<N>.status`, `entry-<N>.next-elected.md` (the spike layout). (c) Two vars naming whole file paths (`CRAFT_DRIVER_STATUS_FILE`, `CRAFT_DRIVER_ELECTION_FILE`). | (a) | One variable; craft never learns the driver's numbering (YAGNI). (b) leaks the driver's scheme into craft for compatibility with a branch that is never merged. (c) makes every new file a new variable. `CRAFT_` follows `CRAFT_ROOT`. |
| DC-2 | How the state dir reaches the run | (a) **Env var only** (the brief), gated on live probe P1. (b) A craft flag `--driver-state <dir>` parsed at 0a (rides the prompt; must also be stripped from elections; rebuild re-reads it from `RESOLVE:`). (c) Both, flag wins. | (a), switch to (b) if P1 fails | E6: propagation into a `--bg` session is unproven, so the choice hangs on one cheap probe. (a) keeps the prompt clean and cannot be pasted forward; (b) is propagation-proof but adds a flag surface that the election must also strip. |
| DC-3 | Election file content | (a) **Two files**: `next.md` (rationale) + `next.prompt` (raw prompt, stripped whole). (b) One markdown file, the prompt in the single fenced block under `## Ready-to-paste prompt` (spike shape); strip inside the fence. (c) JSON `{ item, rationale, prompt }`. | (a) | (a) needs no fence parser: the strip runs over the whole prompt file, which is exactly what 0a would parse. (b) needs a markdown-fence parser (a hand-rolled grammar to fuzz). (c) makes the human-facing part unreadable. |
| DC-4 | Which flags the strip removes | (a) **Every `--policy` token, any verdict** (`always`/`ask`/`never`). (b) Only `--policy <action>=always`. (c) All craft flags (`--policy`, `--skip`, `--profile`, `--harness`, `--config`). | (a) | ADR-130 makes `--policy` the approval channel; a `never` or `ask` from the previous entry is no more the next entry's decision than an `always`. `--skip`/`--profile` are quality knobs a reviewing person can see and keep; stripping them would silently change a deliberate elected profile. |
| DC-5 | Strip matching rule | (a) **Bare whitespace-delimited tokens only** (`--policy <v>`, `--policy=<v>`); quoted/backticked mentions kept as prose; exit 3 if a bare token survives. (b) Every occurrence, quoted or not, with its value (mangles a brief that is about policy flags, e.g. this one). (c) (a) plus refuse the whole prompt when any quoted mention remains. | (a) | Removes everything 0a's grammar defines as a flag without damaging prose. Residual risk, stated in the spec: an orchestrator could still read a quoted mention as a flag; the driver's hard outward guard stays the real boundary (spike: two layers). (c) would refuse the election for any backlog entry that discusses `--policy`. |
| DC-6 | Where the writes land | (a) **`skills/run/SKILL.md`**: `FINISHED` in §Done after `close`; `BLOCKED` through a new cross-phase invariant at every terminal stop. (b) `craft:integrate` step 5 (final summary). (c) A Stop hook that writes the status from the ledger. | (a) | (b) runs before `save`/`emit-metrics`/`close`, so the driver could start the next entry while this one still writes. (c) cannot tell "finished" from "waiting for an answer" (spike: Stop is not idle; background tasks outlive it) and a hook has no PR URL after `close` deleted the ledger. |
| DC-7 | Which stops write `BLOCKED` | (a) **Terminal stops only**: STOPs, declined/unresolvable escalations, `degrade-to-blocker`; escalations are asked first. (b) Every blocker writes `BLOCKED` at once, asks only for decisions forks and paid evals (the spike protocol). (c) Only STOPs; escalations always wait for an answer. | (a) | One blocker protocol for attended and driven runs; the spike proved asks reach the person through `claude attach` and the driver's notification. (b) turns every recoverable blocker into a restart. (c) can hang a run forever on an escalation the person cannot resolve. |
| DC-8 | Status when the PR is not merged | (a) **`BLOCKED integrate: not merged <pr-or-branch>`**. (b) `FINISHED <pr>` regardless; the driver checks. (c) A third verb `PROPOSED <pr>`. | (a) | Keeps the two-verb grammar the driver already parses and keeps `FINISHED` = merged. With (b) the spike driver stops with exit 6 ("claims FINISHED but … is not merged"); (c) breaks every driver that switches on two verbs. The next entry would branch from a main that lacks this change, so stopping the loop is right. |
| DC-9 | Fix for the `EnterWorktree` prompt in `--bg` | (a) **Craft-side, no relocation**: workspace never calls `EnterWorktree`; the session reaches `../<repo>-<slug>` by absolute path (E4: the guard accepts edits outside the shared checkout). (b) Craft-side, managed location: in a bg session (`CLAUDE_CODE_SESSION_KIND=bg`) create the worktree under `.claude/worktrees/<slug>` and `EnterWorktree {path}` (E3: allowed). (c) Driver-side: keep the spike's `PermissionRequest` hook; craft only documents the contract. | (a), gated on live probe P2; (c) documented in the spec as the fallback | (a) changes one prose step, no layout, no bg branch, no hook, and removes the teardown/`ExitWorktree` dance. (b) forks the worktree location by session kind: collision check, rebuild row, teardown path and `ADR-451` wording change, and E5 shows it dirties `git status` in every consumer repo without a `.gitignore` entry. (c) leaves a prompt that `classifierApprovable:false` makes unanswerable without a hook. |
| DC-10 | Implementation surface | (a) **Engine pure module + bin + thin `scripts/` wrapper** (`emit-metrics` pattern). (b) A bash script with a `test/` node:test suite (`run-ledger.sh` pattern). (c) Prose only. | (a) | The strip is a small tokeniser: a pure JS function gets table tests, a generated-corpus idempotence test and Stryker. Memory: shell-script parts passed once, docs and engine parts reliably. (c) is what leaked in E1. |
| DC-11 | An existing `status` file | (a) **Refuse** (exit 4, write nothing, surface). (b) Overwrite atomically. | (a) | A status is the run's final word and the driver may already have acted on it; a confused resume must not turn `FINISHED` into `BLOCKED`. The spike driver already makes the person clear a status to retry. |

## Test strategy

- **Unit (Part 1)** `engine/test/driver-state.test.js`: strip table rows, idempotence and
  "no bare `--policy` token survives" over a seeded generated corpus (fixed seed, a few hundred
  cases, deterministic), grammar accept/reject tables. Stryker-mutated with the engine suite.
- **Integration (Part 2)** `engine/test/driver-state-main.test.js` (real fs in mkdtemp, env injected)
  and `engine/test/driver-state.bin.test.js` (spawned bin): every exit code, write order, atomicity
  (no `*.tmp.*` residue), refusal leaves files byte-identical.
- **Prose pins (Parts 3–5)** `test/driver-contract.test.js` with `sliceProse`: region-scoped, so a
  renamed heading fails loudly. Existing `test/run-record.test.js` §Done pins stay green.
- **Gate:** `bash scripts/ci.sh`; `bash scripts/design-lint.sh` on this doc.
- **Live probes (maintainer smoke, not CI; each in a mktemp throwaway repo, haiku, `claude --bg`):**
  - **P1 — env propagation.** `env CRAFT_DRIVER_STATE=<tmp>/s claude --bg "run: printenv CRAFT_DRIVER_STATE > <tmp>/out"`;
    pass = `<tmp>/out` holds the path. Also once through `claude --bg --resume`. Decides DC-2.
  - **P2 — sibling edit without `EnterWorktree`.** In the throwaway repo, `git worktree add ../<repo>-probe -b probe`,
    then a `--bg` session told to `Write` `../<repo>-probe/x.txt` and never call `EnterWorktree`;
    pass = file written, no `PermissionRequest` event (record events with a marker hook as the spike did).
    Decides DC-9; on failure DC-9 falls back to (b) or (c).
  - **P3 — end to end.** One toy driven run (`CRAFT_DRIVER_STATE` set, `--policy …=always` on the
    command line) on a fixture repo with a `BACKLOG.md` of two entries: `status` = `FINISHED <url>`,
    `next.prompt` has no `--policy`, no `PermissionRequest` in the events log. Then one forced STOP
    (invalid manifest): `status` = `BLOCKED resolve: …` and the ledger still open.

## Out of scope

- **A production driver** (queueing, polling, notifications, the outward guard): the spike's driver
  stays a learning artifact; this change is the run-side contract only.
- **A CI fix-round cap** ("BLOCKED after one CI fix round"): a driver policy the driver's brief can
  keep stating; `craft:integrate` step 1 keeps "fix to green".
- **Committing the §Done rows (metrics, memory) to main.** Not a craft step; in `--bg` its `Edit`
  needed a second worktree (E2 last row). Craft's own §Done writes go through Bash and passed (E2).
- **`strategy: in-place` under `--bg`**: the guard refuses edits in the shared checkout (E2); the repo
  opt-out is the `worktree.bgIsolation` setting, which craft must not write (it would be self-approval,
  and the spike's guard-tamper probe shows the guard refuses that write anyway).
- **Resuming a run killed between `close` and `status`**: the rebuild table has no row for a closed
  ledger; one line to prove it would be a SIGKILL probe at that point.
- **Writing the election in attended runs**: the chat hand-over stays the user's own instruction (R1).
