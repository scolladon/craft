# Design — transient-model-retry

> Brief: make the written model-degradation rule and the rule practised in runs agree, so
> that one transient 529 on the first spawn no longer costs the run its `opus` tier.
> Status: draft → self-reviewed ×3

## Context

The rule is prose that the session orchestrator follows. No engine code retries a spawn or
degrades a tier. The only engine touchpoint is `engine/src/resolve.js:233-238`: when
`models.fallback` is declared, it emits the record line `models.fallback: "<tier>" declared —
fallback re-resolution policy active for degraded tiers.`

The rule is written in three places that must stay in sync:

| Surface | Location | Today |
|---|---|---|
| Invariant | `skills/run/SKILL.md:460-471`, bullet **Model resolution & fallback** | Any model-availability error (down/overloaded/unknown) marks the tier **degraded for the rest of the run**, re-resolves it, respawns from the artifact, and records the degradation. |
| Walk step | `skills/run/SKILL.md:372-373`, step 9 **On model-down** | `mark tier degraded; re-resolve to fallback; respawn from artifact. Record degradation in run record.` |
| Port spec | `docs/contributing/specs/model.md`: **Core policy retained** (`:20-33`), Claude `isAvailable` (`:45-46`), Copilot `isAvailable` (`:89-90`), **Runtime errors** (`:127-129`) | Says the same thing. `:24-25` requires the resolution order to be kept identical to the SKILL block. |

The run record has no fixed token for a degradation today. The line is free prose. The
walk's own tokens are listed at `skills/run/SKILL.md:190-192` ("Besides the walk's own
(…)"), and the prose-only family is listed at `docs/contributing/specs/run-record.md:75-78`.
Neither list has a model token. ADR-041 sets the named default fallback (`sonnet`) and keeps
the session model as the last-resort guarantee. This design leaves both unchanged.

**Incident.** The decision-drift-propagation run's first design spawn died on a 529 before
it produced any work. The session did not degrade `opus`. It retried once on the pinned
tier, which goes against the invariant (`BACKLOG.md:408-417`). That run's transcript no
longer exists on this machine: a search of `~/.claude/projects/**/*.jsonl` for
`overloaded_error|API Error: 5xx` turns up nothing from it. So the incident is known only
from the backlog entry.

**What the harness already does: pinned by reading the shipped Claude Code bundle** (CLI
`2.1.296`, `strings` over `@anthropic-ai/claude-code/bin/claude.exe`, read-only, nothing
executed):

| Fact | Evidence in bundle |
|---|---|
| A sub-agent query counts as foreground, so a 529 is retried, not dropped | `function ISe(e){…if(e.startsWith("agent:"))return!0;…}`. Only non-foreground sources hit `tengu_api_529_background_dropped`. |
| Overload detection | `PB(e)`: `e.status===529 \|\| message includes '"type":"overloaded_error"'` |
| General retry cap | `D6e()`: `CLAUDE_CODE_MAX_RETRIES` if set (clamped to 15), else 10. Under `CLAUDE_CODE_RETRY_WATCHDOG` it is 300. |
| Backoff between attempts | `U$(attempt, …, capMs=32000, jitter proportional)`: exponential, at most 32 s per wait |
| opus/fable/mythos overload cap | Counts consecutive 529s (`w++`). At `tX=3`, it switches to `fallbackModel` if one is set, else throws `"Repeated 529 Overloaded errors"`. The branch is guarded by `!wt()`. Its minified name is shared by several functions, so its exact meaning (probably the account type) is **not resolved**. |
| Permanent-error strings | `not_found_error` with `model:` → model-not-found fallback path. `model_access_denied` / `model_access_refused`. Off-switch messages `"Opus is experiencing high load, please use /model to switch to Sonnet"` (`capacity_off_switch`). |

So by the time the session sees a spawn die on overload, the harness has already retried at
least 3 times with exponential backoff. **Assumption, not pinned:** the Task tool passes that
final error text (the strings above) through to the session. The text the session actually
receives was not captured, because no failing transcript survives.

## Requirements

- R1. SKILL.md (invariant and step 9) and `model.md` state one rule with no contradiction. No
  surface says that a single overload degrades a tier for the run.
- R2. A transient overload on a spawn is retried on the **same tier**, respawned from the
  artifact, at most a bounded number of times before the tier is degraded.
- R3. A permanent availability error (model not found, no access, model switched off,
  capacity off-switch) degrades at once, as today. A permanent dead spawn is never paid twice.
- R4. An error the session cannot classify is treated as permanent. This keeps today's
  behaviour for anything not pinned.
- R5. Degraded-tier memory is unchanged. Once a tier is degraded, later spawns go straight to
  the fallback, and the fallback chain (ADR-041) is untouched.
- R6. Every retry and every degradation leaves a line in the run record (exact shape: DC-3).
- R7. The resolution-order chain is unchanged. After whitespace normalisation it still
  appears verbatim in both SKILL.md and `model.md`: from "→ the descriptor's `model:` field" to
  "→ session model". This was checked against the current tree, where both match. Only the
  failure branch changes.

## Design

Shown with DC-1 (a), DC-2 (a), DC-3 (a) and DC-4 (a), the recommended options. Each
alternative changes only the part noted in its row.

**Error classes** (session-side, matched on the surfaced spawn error text):

| Class | Matches (Claude binding) | Action |
|---|---|---|
| `overload` (transient) | `529`, `overloaded_error`, `Overloaded`, `Repeated 529 Overloaded errors` | Retry once on the same tier |
| `unavailable` (permanent) | Model not found / unknown, no access, `is currently unavailable`, `experiencing high load … switch to Sonnet`, or anything unmatched | Degrade now (today's path) |

The off-switch message is an explicit server instruction to switch tier, so it is permanent
even though it mentions load. Other bindings have no pinned overload strings, so they always
classify as `unavailable`. That is today's behaviour for them. When one text matches both
classes, `unavailable` wins. `529` matches only as an HTTP status or API error code, never as
a bare substring.

**Fan-out edge:** parallel spawns on one tier each own their single retry. When one retry
fails, the tier becomes degraded. A retry already in flight finishes on its tier, and every
spawn not yet issued goes straight to the fallback. A spawn that died after committing
partial work is respawned from that artifact, both on retry and on degrade, as today.

**Flow for one spawn:**

```
spawn(role, tier) ── ok ─────────────────────────────────────▶ continue
      │ dies on model-availability error
      ├─ class=unavailable ───────────────────────────────────▶ degrade(tier)
      └─ class=overload
           ├─ this spawn already retried? ── yes ─────────────▶ degrade(tier)
           └─ no ─▶ record MODEL-RETRY ─▶ respawn(role, tier) from artifact (no wait)

degrade(tier): mark tier degraded for the run → record MODEL-DEGRADED → re-resolve
               (models.fallback → sonnet → session model) → respawn from artifact
```

**Proposed SKILL.md invariant text.** It replaces the sentences after "pass the resolved tier
as the spawn's model param)." up to the `(This is the Model port's …)` line:

```
  If a spawn dies on a model-availability error (NOT a task blocker, which uses the
  blocker protocol), classify it. A transient overload (`529` / `overloaded_error`) is
  retried ONCE on the same tier, respawned from the artifact, recording
  `MODEL-RETRY(<role>): <tier> overload`. Any other availability error (model unknown,
  no access, switched off), an unclassifiable one, or an overload on that retry marks the
  model **degraded for the rest of the run**: record `MODEL-DEGRADED(<tier>):
  fallback=<tier> cause=<overload|unavailable>`, re-resolve to `models.fallback` if
  declared, else the engine default `sonnet`, else the session's own model (guaranteed
  available), then respawn from the artifact. Once a tier is known degraded this run,
  later spawns skip straight to the fallback — never pay the same dead spawn twice.
```

**Step 9** becomes: `On model-down (not a task blocker): an overload retries once on the same
tier (MODEL-RETRY); otherwise, or on a second overload, mark the tier degraded and re-resolve
to fallback (MODEL-DEGRADED); respawn from artifact.`

**`model.md` edits:**

- **Core policy retained** gets a new bullet before **Degraded-tier memory**: `**Transient-overload
  retry**: a spawn that dies on a transient overload is respawned once on the same tier before
  the tier is degraded; any other availability error degrades at once. Keep identical to the
  "Model resolution & fallback" block in skills/run/SKILL.md.`
- **Runtime errors** (`:127-129`): split the sentence into "overloaded → one same-tier retry,
  then the degraded-tier path" and "down / unknown / no access → the degraded-tier path".
- Claude `isAvailable` (`:45-46`) and Copilot `isAvailable` (`:89-90`): "a model-availability
  error marks the tier degraded and returns `false`" becomes "…returns `false`; core decides
  whether that degrades the tier". The probe reports, and core decides.

**Run-record tokens.** Both tokens are emitted by the walk itself:

- They join the "Besides the walk's own (…)" list at `skills/run/SKILL.md:190-192`.
- They join the prose-only family list at `docs/contributing/specs/run-record.md:75-78`.
- Shapes:
  - `MODEL-RETRY(<role>): <tier> overload`
  - `MODEL-DEGRADED(<tier>): fallback=<tier> cause=<overload|unavailable>`
- They are not added to the parsed Token-vocabulary table, so `engine/src/run-state.js` is
  unchanged.

**Rule vs fact.** This rewrites a standing rule instead of stating one missing fact
("a 529 is transient; the harness already backed off"). The fact alone would not suffice:
the old invariant explicitly orders degradation on *overloaded*, so an orchestrator that
knew the fact still had to break a written rule to act on it, which is exactly the
disagreement this change removes. The rule has to change; the fact is folded into it as
the classification.

**Touched files (recommended set):** `skills/run/SKILL.md`, `docs/contributing/specs/model.md`,
`docs/contributing/specs/run-record.md`, and one new process test `test/model-retry-token.test.js`.
No engine source changes. `README.md:105` and `docs/guides/customizing.md:117` are still true
as written ("model degradation" is still recorded), so they stay untouched.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Mechanism | (a) **Classified bounded retry**: overload → one same-tier retry; anything else → degrade now. Files: SKILL.md, model.md, run-record.md, new test. (b) **Unclassified codification**: every availability error gets one same-tier retry, which is exactly what was practised. Same files, less text. (c) **Manifest knob** `models.retry: <n>` (default 1) plus the (a) classification. Adds `engine/src/manifest.js` `validateModels` / `MODELS_KEYS` and its error message, `engine/test/manifest*.test.js`, `engine/src/manifest-vocabulary.js`, `docs/guides/customizing.md` `models:` (~:303, ~:475), the config-tuner lint-clean knob list, and possibly a `resolve.js` record line. | (a) | (b) pays a dead spawn twice on a permanent error (unknown model, no access), which breaks R3 and the "never pay twice" rule. (c) adds a dial with no demand (YAGNI). The harness already has its own inner dial, `CLAUDE_CODE_MAX_RETRIES`. |
| DC-2 | Retry budget scope | (a) **Per spawn**: each spawn may retry once; a failed retry degrades the tier for the run. (b) **Per tier per run**: one retry for the whole run; the next overload anywhere degrades. (c) **Per phase**: one retry per phase, shared by its spawns and fan-out. | (a) | It matches the practised deviation and is the simplest to state. Worst case is one extra dead attempt per spawn on a flapping tier. Those attempts produce no work, and degraded memory stops them once any retry fails. (b) brings back the original problem: a later blip degrades the whole tier. |
| DC-3 | Recording | (a) **Two prose-family tokens**, `MODEL-RETRY(<role>):` and `MODEL-DEGRADED(<tier>):`, listed in SKILL.md and run-record.md and pinned by a grep test. No run-state change. (b) **The same tokens in the parsed Token-vocabulary table**, plus regex and warnings in `engine/src/run-state.js` and its tests. (c) **No token**: free prose, as today. | (a) | A fixed token you can grep is the house convention (INTENTION-*, STUB-*). Nothing consumes model lines yet, so parsing them (b) would be dead code. |
| DC-4 | Session-side wait before the retry | (a) **None**: respawn at once and rely on the harness's inner exponential backoff (≥3 attempts, ≤32 s per wait). (b) **Fixed wait** (e.g. 60 s) via a background sleep or monitor before the respawn. | (a) | The harness has already backed off before the session sees the failure. A foreground sleep in the orchestrator is blocked in Claude Code, so (b) needs a background mechanism, which adds a moving part for unproven gain. |

## Test strategy

The change is prose, so the proof is prose pins in a new process suite,
`test/model-retry-token.test.js`. It is picked up by `scripts/ci.sh`'s `test/` discovery and
by `test/every-test-file-registers.test.js`. It reuses the region-slicing idiom of
`test/run-record.test.js:50` (`sliceRegion`, lines joined with spaces so a wrapped phrase
still matches). Given/When/Then titles:

1. The SKILL.md **Model resolution & fallback** bullet contains `MODEL-RETRY(` and
   `MODEL-DEGRADED(`, plus the phrase `retried ONCE on the same tier`.
2. SKILL.md step 9 contains `MODEL-RETRY` and `MODEL-DEGRADED`.
3. The SKILL.md "Run-record tokens" walk list and the `run-record.md` family list each
   contain both token prefixes.
4. The `model.md` **Core policy retained** section contains a `Transient-overload retry`
   bullet.
5. Sync guard (R7): after whitespace normalisation, the chain from "→ the descriptor's
   `model:` field" to "→ session model" appears in both SKILL.md and `model.md`. The
   leading `manifest` backticks differ between the two files today, so the guard starts
   after them.
6. Negative guard (R1): no live surface still says a bare "model down/overloaded/unknown …
   degraded for the rest of the run". Assert that the old SKILL.md phrase
   `(model down/overloaded/unknown` is absent.

Red first: tests 1-4 and 6 fail against the current tree. Test 5 is a regression guard that
passes before and after. Run `bash scripts/ci.sh` and `design-lint` as the gates.

This design does not use a live 529 test. A real overload cannot be triggered on demand,
and the behaviour is orchestrator prose, not code.

## Out of scope

- **Other bindings' overload strings** (pi, opencode, copilot, codex): none are pinned. They
  classify as `unavailable`, which is today's behaviour.
- **Capturing the exact Task-tool error text**: no failing transcript survives. The
  classification matches the bundle's own strings. Capture the text on the next real 529.
- **A 429 rate limit or usage limit**: this is not a model-availability error today and
  does not change.
- **`docs/contributing/prd/*` and `docs/contributing/archive/*`**: historical design
  records, frozen.
- **Engine enforcement of retry/degrade** (a run-state fold of `MODEL-*` lines): nothing
  consumes those lines yet.
