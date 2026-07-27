# Design — decisions-remote (route the decisions-phase fork conversation to Slack)

> Brief: add an `examples/decisions-remote/` recipe demonstrating "Option A" — routing the
> craft decisions-phase fork conversation to Slack via a per-phase `phases.decisions.context`
> file (webhook post + poll for the answer) with `policy: { always: [external-send] }` so the
> outward Slack posts proceed unattended. Docs/examples-only; no engine code.
> Status: draft → self-reviewed ×3

## Context

**What the decisions phase actually does** (`skills/decisions/SKILL.md`). Phase 3 is
*entirely session-owned — never delegated*. Its preamble (non-overridable) probes the ADR
directory and template. Its default body: (1) triage every design candidate into
*adopt-or-escalate*; (2) a **genuine fork** — the recommendation is unclear, the alternatives
carry a real user-judgment trade-off, or it deviates from an ADR/principle — goes to a user
conversation presenting ≤3 options + the design's recommendation, and the user's decision is
captured; (3) zero genuine forks → a first-class `NO-OP(decisions)` record; (4) a
cross-candidate interaction check; (5) each settled decision authored as an ADR and committed;
(6) a scope-fold rule spawning a fresh designer if a decision deviates. **Steps 1, 3, 4, 5, 6
are contract invariants** — triage, the no-op rule, ADR authoring, scope-fold. Only step 2 —
*how the fork conversation is conducted* — is malleable.

**Injection point #8 — context files** (`docs/guides/customizing.md` §3, PRD §7). A `context:`
value is a repo-relative file appended verbatim into a phase's contract slot. It exists in two
forms: **global** `context: <path>` (every agent + every inline run — see
[`karpathy-as-context/`](../../../examples/karpathy-as-context/)) and **per-phase**
`phases.<id>.context: <path>` (that phase only — see the `review: { context: ... }` line in
[`everything-claude-toolkit/`](../../../examples/everything-claude-toolkit/)). A context file
is **Tier-1, additive, contract-safe**: it *reinforces* the built-in contract with extra
constraints; it can reshape HOW a phase's malleable step runs but cannot replace the phase's
invariant body. A session-owned phase (decisions never spawns) reads its own context inline at
phase start — the same way an `inline` phase reads a global `context:` file itself.

**Why Option A (context) and not override / inserted-phase / role-swap.** `phases.decisions.override`
(#9) replaces the *whole procedure body* — it would put triage, the no-op rule, ADR authoring
and scope-fold in the author's hands and could silently drop them; that is contract-unsafe for a
session-owned phase whose invariants are the point. A context file is additive: it layers the
Slack routing onto step 2 while the engine still binds steps 1/3/4/5/6. That contract-safety is
the whole reason the recipe is a *context* recipe. Option A is therefore pinned by the brief and
by the injection-model, not open for re-decision here.

**Policy** (`docs/contributing/specs/policy.md`). `external-send` ∈ `POLICY_ACTIONS`; its
`DEFAULT_VERDICT` is **`ask`** (it is an outward/remote action). Without an explicit `always`
verdict every Slack post raises an in-session confirmation — which defeats *remote* routing when
the deciding human is in Slack, not the terminal. `policy` is a **top-level, flat**
`{ verdict: [actions] }` map merged across user/project/per-invocation scopes; it has **no
per-phase scope**. The three engine floors (`never-commit-on-red`,
`validation-triage-gates-propose`, `artifact-handoff`) are absent from `POLICY_ACTIONS` and
un-nameable — no verdict can reach them.

**Examples house style** (`examples/README.md`, `test/examples-lint.test.js`). Every example is
`examples/<dir>/workflow.md`: a real YAML-frontmatter manifest + prose body explaining the
injection point, closing with the standard line. Support files referenced by an example manifest
live under `examples/.claude/workflow/` because the linter resolves a manifest's relative file
refs against its **grandparent dir** (here `examples/`). Model prose on
[`policy-headless-merge/`](../../../examples/policy-headless-merge/) and
[`karpathy-as-context/`](../../../examples/karpathy-as-context/). Prior examples-catalog design:
[`examples-catalog-gap-closure.md`](./examples-catalog-gap-closure.md).

## Requirements

Verifiable when this ships:

- **R1** — `examples/decisions-remote/workflow.md` exists: a real manifest + prose body ending
  with the standard line `> In your real repo this file lives at the project root as
  \`.claude/workflow.md\`.`
- **R2** — the manifest declares exactly `phases.decisions.context:
  .claude/workflow/slack-escalation.md` and `policy: { always: [external-send] }`, and
  `bash scripts/manifest-lint.sh examples/decisions-remote/workflow.md` exits 0 printing
  `valid.` (pinned — see Design §Pinned lint matrix).
- **R3** — the support file `examples/.claude/workflow/slack-escalation.md` exists and resolves
  from the manifest's grandparent dir (absence fails lint — pinned negative).
- **R4** — `examples/README.md` carries a linked `](decisions-remote/)` row using `—` in the
  index-number column; no duplicate index numbers; all four `examples-lint` tests stay green.
- **R5** — `slack-escalation.md` specifies the full **post → poll → map → re-ask** protocol,
  takes every secret from env vars only, and on a missing env var falls back **loudly** to the
  normal in-session decisions conversation.
- **R6** — the example prose states the honest limits: the wait is **synchronous** (the session
  sits in the poll loop — minutes-scale, not overnight); the answer leg needs a **bot token with
  channel-history scope** (incoming webhooks are write-only); enforcement is **prompt-level
  instruction-following, not mechanical** (the run record still logs every decision); **Teams**
  incoming webhooks are write-only, so Teams needs a Graph-API bot (out of scope).
- **R7** — `slack-escalation.md` never instructs the session to alter triage, the no-op rule, ADR
  authoring, or scope-fold; it constrains only *how step 2's fork conversation is conducted*.
- **R8** — the change touches only `examples/**` and (optionally, per DC-5) `docs/guides/`; no
  file under `engine/`, `skills/`, `contracts/`, `agents/`, or `pipeline/` is modified.
- **R9** — touched `*.md` is prose-lint clean (no marketing slop), carries no stub markers, no
  suppression directives, and no run-provenance refs (this feature's phase/ADR/backlog numbers) in
  the manifest or the support file — stable injection-point/spec citations (`#8`, `PRD §7`) are
  the examples house style, as in every existing sample, and are not provenance refs.

## Design

### File inventory

| Path | Kind | New/Edit |
|---|---|---|
| `examples/decisions-remote/workflow.md` | manifest + prose | new |
| `examples/.claude/workflow/slack-escalation.md` | per-phase context body (the core deliverable) | new |
| `examples/README.md` | index — one `—`-numbered row | edit |
| `docs/guides/customizing.md` | §4 examples-index row (DC-5) | edit *(conditional)* |

### The manifest (`examples/decisions-remote/workflow.md` frontmatter)

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

The prose body (after the frontmatter) explains: the injection point; that decisions is
session-owned so the context is read by the session itself, not appended to a spawned agent;
why `always: [external-send]` is required; the honest limits (R6); and it closes with the
standard line. It follows the `policy-headless-merge` two-column "unconfigured repo | with this
manifest" table shape for the behaviour delta.

### Pinned lint matrix — `engine/bin/manifest-lint.js` (run live this session)

The manifest schema and file-ref resolution are pinned against the real validator, not memory:

| Input | Result |
|---|---|
| `phases.decisions.context: .claude/workflow/slack-escalation.md` + `policy: { always: [external-send] }`, support file present | `valid.`, exit 0 |
| same manifest, support file **absent** | INVALID: `phases.decisions.context references missing file: .claude/workflow/slack-escalation.md`, exit 2 |
| `policy: { always: [slack-send] }` (unknown action) | INVALID: `unknown policy action: 'slack-send' (expected one of isolate, commit, push, propose, integrate, teardown, external-send, backlog-write)`, exit 2 |

Confirms: (a) per-phase `context` and `external-send` are both accepted keys; (b) the support
file must sit at `examples/.claude/workflow/slack-escalation.md` (ROOT = grandparent of the
manifest = `examples/`); (c) `external-send` is the only valid token for an outward Slack post.

### The escalation context body (`slack-escalation.md`) — content spec

The file is written as instructions to the deciding session, scoped to the decisions phase. It
must specify this protocol and nothing that touches an invariant:

1. **Applies to step 2 only.** For each candidate the session has *already triaged as a genuine
   fork* (triage stays the engine default), conduct the fork conversation over Slack instead of
   in-terminal. Adoption, the no-op record, the cross-candidate check, ADR authoring, and
   scope-fold are unchanged.
2. **Preconditions / secrets.** Read `$SLACK_WEBHOOK_URL`, `$SLACK_BOT_TOKEN`,
   `$SLACK_CHANNEL_ID` from the environment. Never hardcode a secret. If any is unset, announce
   the fallback **loudly** in the run record and conduct the fork conversation the normal
   in-session way (AskUserQuestion) — the recipe degrades, it never proceeds half-configured.
3. **Post the fork.** `curl` a message to `$SLACK_WEBHOOK_URL` carrying the question, the ≤3
   labeled options (A/B/C + label), and the design's recommendation — the exact payload the
   in-terminal fork would show.
4. **Poll for the answer.** Call Slack Web API `conversations.history` with `$SLACK_BOT_TOKEN`
   and `$SLACK_CHANNEL_ID` at a stated interval (e.g. every N seconds) until a human reply
   appears, up to a bounded wait (DC-1).
5. **Map the reply to one option** by its letter or label. An **ambiguous** reply → re-ask in
   the channel; **never guess** (DC-4 sets the parsing latitude).
6. **Capture** the chosen option as the user's decision and hand back to the engine-default ADR
   authoring — the run record logs the decision exactly as an in-terminal fork would.

### Injection semantics

`engine/src/contract.js` (`assembleContract`, verified live this session) appends
`manifest.phases.decisions.context` verbatim into the decisions phase's injected contract block —
**last**, after the invariant core and contract bundles. Because decisions is session-owned, that
assembled block is **read by the session at phase start** (there is no spawned agent to append it
to). Two consequences: the per-phase context is picked up regardless of the inline/spawn path (the
`inline` flag only expands the core fragment); and because it is layered *on top of* the core, it
can only add to the contract, never displace triage/no-op/ADR-authoring/scope-fold — the
structural basis of the contract-safety in R7. Scoping to `phases.decisions.context` (not global
`context:`) keeps the Slack-escalation instructions out of the design/planning/review/etc. contract
slots, where an `external-send` instruction would be noise and could mis-fire.

### Policy rationale and blast radius

`always: [external-send]` is required (R2): the default `ask` verdict would stop the run for
confirmation on every Slack post, defeating remote routing. **Honest-limit to document:** policy
has no per-phase scope, so `always: [external-send]` greenlights *every* external-send in the
run, not only the decisions-phase Slack posts. The example prose must state this blast radius
plainly. The three engine floors remain un-nameable and unaffected.

### External wire shapes — documented, not live-pinned

The craft-side contract (manifest + examples guards) is pinned live above. The **Slack** wire
shapes (incoming-webhook POST, `conversations.history` GET) are **documented from Slack's public
API**, not live-pinned — this environment has no Slack workspace or credentials to run the real
calls against. The example prose must therefore present its `curl` snippets as
**copy-paste-then-verify against your own workspace**, consistent with R6's "enforcement is
prompt-level, not mechanical." A live Slack integration test is explicitly out of scope.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| DC-1 | Poll-timeout fallback: what the session does when the bounded poll wait elapses with no reply | (a) fall back to the normal in-session conversation (loud notice); (b) record a blocker `{ unit, reason, ≤3 options }` and stop; (c) keep polling indefinitely | **(a)** fall back to in-session, loudly | Mirrors the missing-env-var rule (R5) and craft's "never spin or guess"; (c) violates never-spin; (b) stalls a run that a present human could still finish in-terminal. Under a headless binding (no live user), (a)'s in-session conversation can only record a blocker anyway — so (a) subsumes (b) exactly where (b) would apply |
| DC-2 | Example directory name | (a) `decisions-remote`; (b) `decisions-slack`; (c) `decisions-remote-slack` | **(a)** `decisions-remote` (per brief) | Frames the pattern as "route the fork *remotely*", Slack as the worked instance; the prose names Slack explicitly and calls Teams out-of-scope so the generic name does not over-promise a transport-agnostic surface that does not exist |
| DC-3 | Context-file scope | (a) per-phase `phases.decisions.context`; (b) global `context:` | **(a)** per-phase (per brief) | The escalation protocol is only meaningful in the decisions phase; scoping there keeps every other phase's contract slot clean and prevents an `external-send` instruction leaking into design/plan/review runs |
| DC-4 | Reply-parsing latitude when mapping a Slack reply to an option | (a) exact-token only (must reply `A`/label, else re-ask); (b) interpret natural language, re-ask only on genuine ambiguity; (c) interpret freely, best-effort pick | **(b)** interpret, re-ask on genuine ambiguity | (c) risks a wrong ADR from a misread (violates "never guess"); (a) is brittle for humans typing on mobile; (b) matches the brief's "ambiguous → re-ask, never guess" while tolerating natural replies |
| DC-5 | Docs-surface breadth | (a) `examples/README.md` row only (guard-required); (b) also add a row to `docs/guides/customizing.md` §4 examples index | **(b)** also update the customizing.md index | The policy/intention/memory examples all carry a §4 index row; omitting one leaves the catalog index inconsistent. (a) is the minimum the guard enforces; (b) keeps the two indexes reconciled (the recurring examples-catalog drift concern) |

## Test strategy

Docs/examples-only — the proof is the existing mechanical guards, not new unit tests:

- **`examples-lint` (`test/examples-lint.test.js`)** — four guards must stay green after the
  change: (1) at least one manifest exists; (2) every `examples/*/workflow.md` lints `valid.`
  (covers R2); (3) every discovered example dir appears as a `](decisions-remote/)` link in the
  README (covers R4); (4) no README link is stale; plus the index-number-uniqueness guard (the
  `—` column avoids collision).
- **`manifest-lint` direct** — the pinned matrix above is the acceptance oracle for R2/R3; the
  valid case and both negative cases were run live this session.
- **prose-lint (advisory)** — runs over touched `examples/*.md` and `docs/guides/*.md`; keep it
  clean (R9). No stub markers, suppression directives, or provenance refs.
- **Edge matrix** — support-file-absent → lint fail (pinned); unknown policy action → lint fail
  (pinned); duplicate README index number → guard fail; dead README link → guard fail. Each is
  covered by an existing guard, so no new test file is introduced.
- **No unit/integration tests are added** — there is no engine code in this change, and the
  Slack integration is prompt-level (R6), not mechanically testable here.

## Out of scope

- **Any engine/skill/contract change** — no new `remote:`/`slack:` manifest key, no change to the
  decisions skill, policy engine, or context-injection code; the recipe rides existing surfaces.
- **A live Slack integration test** — no workspace/credentials in this environment; the recipe is
  copy-paste-then-verify (see Design §External wire shapes).
- **Teams / Graph-API bot** — Teams incoming webhooks are write-only, so the answer leg would need
  a Graph-API bot; named in the prose as a limit, not built.
- **Async / overnight escalation** — the recipe is synchronous poll-loop only (minutes-scale); a
  durable queue / callback server is a different design.
- **Mechanical enforcement of the protocol** — enforcement is prompt-level instruction-following;
  the run record remains the audit trail, not a hard gate.
- **Per-phase policy scoping** — `policy` is a top-level flat map with no per-phase scope; the
  example documents the `external-send` blast radius rather than narrowing it (no such surface).
