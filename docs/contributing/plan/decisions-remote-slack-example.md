# Plan — decisions-remote (route the decisions-phase fork conversation to Slack)

> Source: design doc `docs/contributing/design/decisions-remote-slack-example.md` · ADRs `295, 296, 297, 298, 299`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Docs/examples-only change, no `src/` delta → the whole deliverable is one standalone
  docs-only part (sizing exception). The four files form one coherent catalog entry: the
  `customizing.md` index row (ADR 299) is meaningless without the sample it points at, so
  they land as one atomic commit.
- No engine/skill/contract/agent/pipeline file is touched (R8). No new exported symbol,
  barrel entry, or facade. The only downstream "surface" is the examples **catalog**: two
  indexes must both carry the new row — that surface gate is pre-paid in-part (see Context).

## Part 1 — decisions-remote Slack-escalation sample + both catalog indexes

### Context

Zero-context handoff. Everything below is quoted so the implementer does not re-explore.

**Working directory (work ONLY here):** `/Users/scolladon/workspace/perso/craft-decisions-remote-slack-example`

**The four files to touch** (design §File inventory):

| Path | Kind | New/Edit |
|---|---|---|
| `examples/decisions-remote/workflow.md` | manifest + prose | new |
| `examples/.claude/workflow/slack-escalation.md` | per-phase context body (the core deliverable) | new |
| `examples/README.md` | index — one `—`-numbered row | edit |
| `docs/guides/customizing.md` | §4 examples-index row (ADR 299) | edit |

**Surface gates this part must pre-pay (the catalog is the public surface):**
- `test/examples-lint.test.js` test #3 — every auto-discovered `examples/<dir>/` must
  appear as a `](decisions-remote/)` link in `examples/README.md` (else RED
  "missing linked rows for: decisions-remote").
- `test/examples-lint.test.js` test #4 — every `](<dir>/)` README link must resolve to a
  dir with a `workflow.md` (else RED "links dirs with no workflow.md").
- `test/examples-lint.test.js` test #5 — index-number uniqueness: the guard collects
  `\d+` from **column 1 only** (`line.split('|')[1]`). Use `—` (em-dash) in column 1 so the
  row contributes no number → no collision. The Tier `1` sits in column 4, which the guard
  never reads.
- `test/examples-lint.test.js` test #2 — every `examples/*/workflow.md` must lint `valid.`
  (covers R2/R3).
- `docs/guides/customizing.md` §4 index (ADR 299 / DC-5) — **no mechanical guard enforces
  this row**; it is required by ADR 299 and verified by inspection. Omitting it re-opens the
  index-drift the catalog closed before. It is in-scope, not optional.

**R2-pinned manifest — write `examples/decisions-remote/workflow.md` frontmatter EXACTLY this
(verbatim from design §The manifest; the comment block is part of the house style):**

```yaml
---
# Route the craft decisions-phase fork conversation to Slack. Injection point #8 (PRD §7):
# per-phase `phases.decisions.context` — an additive, contract-safe Tier-1 file the
# session-owned decisions phase reads inline at phase start. `policy.always: [external-send]`
# lets the outward Slack posts proceed unattended instead of stopping for confirmation.
phases:
  decisions:
    context: .claude/workflow/slack-escalation.md
policy: { always: [external-send] }
---
```

**Manifest prose body** (after the frontmatter): explain the injection point; that decisions
is **session-owned** so the context is read by the session itself, not appended to a spawned
agent; why `always: [external-send]` is required; the honest limits (R6); the policy blast
radius (design §Policy rationale: `policy` has no per-phase scope, so `always: [external-send]`
greenlights *every* external-send in the run, not just decisions-phase posts — state this
plainly). Model the prose on `examples/policy-headless-merge/workflow.md` and
`examples/karpathy-as-context/workflow.md`. Include the `policy-headless-merge` two-column
`| | unconfigured repo | with this manifest |` delta table for the behaviour change. **Close
with the standard line, byte-exact:**

```
> In your real repo this file lives at the project root as `.claude/workflow.md`.
```

**Support-file body — `examples/.claude/workflow/slack-escalation.md`.** Written as
instructions to the deciding session, scoped to the decisions phase. It resolves from the
manifest's **grandparent dir** (`examples/`), so the ref `.claude/workflow/slack-escalation.md`
must land at exactly `examples/.claude/workflow/slack-escalation.md` (confirmed live: absence
→ manifest-lint exit 2 "phases.decisions.context references missing file: …"). Model the
header/framing on `examples/.claude/workflow/sec-rules.md` (a per-phase context body). Specify
this 6-step protocol and nothing that touches an invariant (design §escalation context body):

1. **Applies to step 2 only.** For each candidate the session has *already triaged as a genuine
   fork* (triage stays the engine default), conduct the fork conversation over Slack instead of
   in-terminal. Adoption, the no-op record, the cross-candidate check, ADR authoring, and
   scope-fold are unchanged (R7 — never instruct altering these).
2. **Preconditions / secrets.** Read `$SLACK_WEBHOOK_URL`, `$SLACK_BOT_TOKEN`,
   `$SLACK_CHANNEL_ID` from the environment. Never hardcode a secret. If any is unset, announce
   the fallback **loudly** in the run record and conduct the fork the normal in-session way
   (AskUserQuestion) — the recipe degrades, never proceeds half-configured (R5).
3. **Post the fork.** `curl` a message to `$SLACK_WEBHOOK_URL` carrying the question, the ≤3
   labeled options (A/B/C + label), and the design's recommendation — the exact payload the
   in-terminal fork would show.
4. **Poll for the answer.** Call Slack Web API `conversations.history` with `$SLACK_BOT_TOKEN`
   and `$SLACK_CHANNEL_ID` at a stated interval (e.g. every N seconds) until a human reply
   appears, up to a **bounded** wait. **On timeout (ADR 295): fall back LOUDLY to the normal
   in-session conversation** — state the bounded wait and this fallback in the same breath;
   never keep polling, never silently stop. (Under a headless binding with no in-session user,
   that in-session fallback degrades to a recorded blocker — do not configure a separate blocker
   path.)
5. **Map the reply to one option** (ADR 298 / DC-4): **interpret** the natural-language reply
   against the posted option letters and labels; a reply you cannot confidently map is
   **re-asked in the channel**. Never exact-token-only; never best-effort-guess.
6. **Capture** the chosen option as the user's decision and hand back to engine-default ADR
   authoring — the run record logs the reply text alongside the option it resolved to, exactly
   as an in-terminal fork would.

**R6 honest limits the support-file prose (or the manifest prose) must state:** the wait is
**synchronous** (the session sits in the poll loop — minutes-scale, not overnight); the answer
leg needs a **bot token with channel-history scope** (incoming webhooks are write-only); the
`curl` snippets are **copy-paste-then-verify against your own workspace** — Slack wire shapes
are documented from Slack's public API, not live-pinned here (no workspace/credentials in this
environment); enforcement is **prompt-level instruction-following, not mechanical** (the run
record is the audit trail); **Teams** incoming webhooks are write-only, so Teams needs a
Graph-API bot — named as out-of-scope, not built.

**R9 — hygiene (applies to every touched file):** no marketing slop; no stub markers; no
suppression directives (`@ts-ignore`, `eslint-disable`, coverage-ignore, etc.); **no
run-provenance refs** — do NOT write this feature's ADR numbers (295–299), DC-N labels, phase
names, or backlog ids into the manifest or the support file. Stable injection-point/spec
citations (`#8`, `PRD §7`, "step 2") ARE the examples house style and are fine.

**README row — `examples/README.md`.** The `## By injection point` table header is
`| # | Injection point | Example | Tier |`. Existing `—`-numbered rows to model on (context
file is Tier 1; ADR 296 requires the row wording mention **Slack**):

```
| — | **policy** — headless auto-merge (`policy:`) | [`policy-headless-merge/`](policy-headless-merge/) | 0 |
| — | **intention** corpus (`intention:`) | [`intention-corpus/`](intention-corpus/) | 0 |
| — | **memory** cache (`memory:`) | [`memory-cache/`](memory-cache/) | 0 |
```

Add one row alongside them (place it near the other `—` port/cross-cutting rows), e.g.:

```
| — | **decisions → Slack** — route the fork conversation remotely (`phases.decisions.context`) | [`decisions-remote/`](decisions-remote/) | 1 |
```

Hard constraints (not the exact prose): column 1 is `—` (em-dash, no digit); the Example cell
carries the link `[`decisions-remote/`](decisions-remote/)`; wording mentions **Slack**; Tier
column is `1`.

**customizing.md §4 row — `docs/guides/customizing.md`.** The `## 4. Examples index` table
header is `| Point | Sample | Notes |` (around lines 365–386). Note the sample links here use
the `../../examples/` prefix. Rows to model on (lines 381–383):

```
| policy — headless auto-merge | [`policy-headless-merge/`](../../examples/policy-headless-merge/) | `policy: { always: [integrate, propose] }` — supersedes merge/PR confirmation |
| intention corpus | [`intention-corpus/`](../../examples/intention-corpus/) | `intention: { source: file, gate, covers }` — living pages into the design/plan contract |
| memory cache | [`memory-cache/`](../../examples/memory-cache/) | `memory: { source: file }` — advisory per-repo learning cache |
```

Add one matching row (place it in the same ungrouped block, e.g. after the memory-cache row):

```
| decisions → Slack (remote escalation) | [`decisions-remote/`](../../examples/decisions-remote/) | `phases.decisions.context` + `policy: { always: [external-send] }` — route the fork conversation to Slack |
```

**Live-pinned lint matrix (confirmed this session against `engine/bin/manifest-lint.js`):**

| Input | Result |
|---|---|
| pinned manifest + support file present | `craft-manifest: <path> valid.`, exit 0 |
| pinned manifest, support file **absent** | exit 2, `phases.decisions.context references missing file: .claude/workflow/slack-escalation.md` |
| `policy: { always: [slack-send] }` (unknown action) | exit 2, `unknown policy action: 'slack-send' (expected one of isolate, commit, push, propose, integrate, teardown, external-send, backlog-write)` |

`external-send` is the only valid token for an outward Slack post (do NOT invent `slack-send`).

### TDD steps

This is docs-only: the existing mechanical guards ARE the tests (design §Test strategy). The
RED entries drive each guard from failing to green as the artifacts land; the two edits with no
mechanical guard (customizing.md row, R6 prose completeness) are verified by inspection.

- **RED 1 (manifest guard — R3 pinned negative).** Write `examples/decisions-remote/workflow.md`
  with the R2-pinned frontmatter + prose body, but do NOT create the support file yet. Run
  `bash scripts/manifest-lint.sh examples/decisions-remote/workflow.md`.
  Expected failure: exit 2, `phases.decisions.context references missing file:
  .claude/workflow/slack-escalation.md`.
- **GREEN 1.** Create `examples/.claude/workflow/slack-escalation.md` with the full 6-step
  protocol (+ R5/R6/R7/ADR-295/ADR-298 behaviours). Re-run the same command.
  Expected: `craft-manifest: … valid.`, exit 0.
- **RED 2 (README coverage guard — R4).** Run `node --test test/examples-lint.test.js`. Test #2
  now passes (manifest valid) but the README has no row for the newly-discovered dir.
  Expected failure: test #3 fails — `examples/README.md missing linked rows for: decisions-remote`.
- **GREEN 2.** Add the `—`-numbered, Slack-mentioning, `](decisions-remote/)`-linked row to
  `examples/README.md` (column 1 = `—`, Tier 1). Re-run `node --test test/examples-lint.test.js`.
  Expected: all five guards green (coverage #3, resolution #4, uniqueness #5, non-vacuous #1,
  lint #2).
- **GREEN 3 (ADR-299 index reconciliation — no mechanical guard).** Add the matching row to
  `docs/guides/customizing.md` §4 examples index (`../../examples/decisions-remote/` link).
  Verify by inspection that both indexes now carry the sample and point at the same dir.
- **REFACTOR / self-check.** Re-read all four files: manifest frontmatter is byte-identical to
  the pinned block; support file states every R6 limit and never instructs altering
  triage/no-op/ADR-authoring/scope-fold (R7); no provenance refs, stub markers, or suppression
  directives in any touched file (R9); the standard closing line is byte-exact in the manifest.
  Run both gate commands one final time.

### Gate

```
node --test test/examples-lint.test.js
bash scripts/manifest-lint.sh examples/decisions-remote/workflow.md
```

Both must pass: the node test reports all guards green; manifest-lint must print `valid.`
(`craft-manifest: examples/decisions-remote/workflow.md valid.`, exit 0). Run from the repo
root. (The phase-boundary `bash scripts/ci.sh` — including advisory prose-lint over the touched
`*.md` — is run by the orchestrator, not this part; keep R9 satisfied so it stays green.)

### Commit

```
docs(examples): decisions-remote — route the decisions-phase fork conversation to Slack
```
