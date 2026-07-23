# Plan — native Aider binding of the craft harness

> Source: design doc `docs/design/native-aider-binding.md` · pinned contract `docs/adapters/aider-poc-record.md` · ADRs none
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it must
  earn it. No standalone test-only parts for FEATURE code: each `src/` part folds its own
  unit test (the module and the test it exercises land in one commit).
- **Standalone (test-infra/docs-only, no `src/` delta) — legitimately their own parts:**
  Part 1 (role agents + config template + README + `native-surface.test.js` honesty pins)
  and Part 8 (ci wiring + BACKLOG entry). Neither adds a `src/` module, so there is no
  implementation part to fold into.
- Parts share ONE working tree and land sequentially in the order below; each part's gate
  is green standalone at the point it lands.

## Decisions (bound — all decided upstream)

Every load-bearing choice is settled in the accepted design's Decision-candidates table
(A–F); this plan opens no new decision candidate.

- **A — role files body-only.** `adapters/aider/agents/craft-<role>.md` is BYTE-IDENTICAL to
  the BODY of the shared `agents/<role>.md` (frontmatter stripped). No frontmatter fence —
  Aider consumes the file as raw `--read` context and parses no frontmatter.
- **B — attribution off.** VCS posture disables all attribution → one-line-conventional commits.
- **C — first-class VCS port.** A dedicated `adapters/aider/src/vcs-posture.js` module, and
  `VCS` is exercised in the probe's `portsExercised`.
- **D — `--source aider` via a per-source file-matcher seam** in `usage-mine-main.js`
  (Aider persists real tokens, so the miner is wired — unlike Cursor).
- **E — guard NO-GO.** No `hooks/`, no guard module, no wrapper. Nothing to build; the
  declination is recorded in the README honesty pins (Part 1) and the BACKLOG entry (Part 8).
- **F — reset-to-pre-turn-HEAD on a red gate.** A PURE reconcile helper lives in
  `vcs-posture.js`; the actual `git reset` is runner/orchestrator behaviour, out of module scope.

## Public-surface decision (up front — every new exported symbol)

- **Adapter-internal (scoped to `adapters/aider/`, no repo-wide barrel/facade/registry):**
  `resolveAiderModel` + `AIDER_TIER_MODELS` (Part 2), `buildLaunchArgs` (Part 3),
  `buildVcsPostureArgs` + `reconcileGateOutcome` (Part 4), `runAcceptanceProbe` (Part 5).
  There is no adapter barrel or index in this repo (siblings export directly and are imported
  by path); these are consumed only within `adapters/aider/`. No downstream surface gate.
- **Engine/src public surface:** `parseLines` (+ the token mapper) exported from
  `engine/src/observability/adapters/aider/telemetry.js` (Part 6) is imported by the miner.
  Its downstream surface gates — all pre-paid in-plan: (1) the miner's `SOURCES` registry
  (wired Part 7), (2) the `unknown --source` error listing which enumerates
  `Object.keys(SOURCES)` — a new listing test is added in Part 7, (3) Stryker mutation scope
  is the `engine/src/**/*.js` glob which auto-covers the new adapter + the miner edit — **no
  `stryker.conf` edit, no allowlist**. `resolveFileMatcher` + `resolveDefaultReadRoot` (Part 7)
  are engine/src test seams (mirroring the existing `resolveDefaultReadRoot` export); their only
  consumers are the miner and its tests. No engine barrel, no generated API report, no README
  surface for these functions (the adapter README covers the binding as a whole).

## No-provenance / fail-loud discipline (every part)

Source and test carry **no** ADR/phase/backlog/`Part N` reference and no shell-injection
expansion (`native-surface.test.js` asserts this repo-wide for the adapter surface). Unknown
tiers, empty models, and malformed token lines fail loud or are counted — never silent-zero,
never swallowed. Never commit on a red gate.

---

## Part 1 — role agents + config template + README + native-surface honesty pins

### Context

**Standalone** (docs/test-infra; no `src/` delta). Mirror the Cursor adapter layout at
`adapters/cursor/` — but Aider is body-only (no frontmatter) and has NO guard/hooks/skill.

Files to CREATE:
- `adapters/aider/agents/craft-<role>.md` × 9. ROLES (exact):
  `backlog-ticker, designer, docs-writer, harness-triager, part-implementer, planner,
  refactor-executor, requirements-writer, reviewer`.
  Each file's ENTIRE content = the BODY of the shared `agents/<role>.md` — i.e. everything
  after the closing `---` of that file's frontmatter, with leading blank lines trimmed
  exactly as `bodyOf` computes it (see below). The shared files carry a 3-key frontmatter
  (`name`, `description`, `model: opus`); the aider file reproduces NONE of it — **no `---`
  fence at all**, first byte is the body's first byte.
- `adapters/aider/config.template.yml` — a `.aider.conf.yml` template. Plain-text/regex-checkable
  (the adapter test uses only node builtins — NO yaml import). MUST contain: the non-interactive
  + telemetry posture keys (`yes-always: true`, `gitignore: false`, `check-update: false`,
  `show-release-notes: false`, `analytics: false`), the VCS posture
  (`auto-commits: true`, `dirty-commits: false`, `attribute-author: false`,
  `attribute-committer: false`, `attribute-co-authored-by: false`), a `read: [CONVENTIONS.md]`
  line, and a `models:` block with the three live-pinned tier ids (see Part 2). CLI wins over
  config (CLI > env > config) — a doc comment, not enforced here.
- `adapters/aider/README.md` — mirror `adapters/cursor/README.md` structure (What this binds /
  Install / Auth / Measured posture / Model tiers), rewritten for Aider. MUST carry the four
  honesty lines the test pins (see TDD). Auth section: env/file, **not** keychain — pass
  `ANTHROPIC_API_KEY` through; nothing to symlink (the Cursor keychain lesson does not transfer).
- `adapters/aider/test/native-surface.test.js` — the honesty/byte-identity gate. Model it on
  `adapters/cursor/test/native-surface.test.js` (read that file first) but adapt for body-only.

Reuse from the cursor test verbatim: `parseFrontmatter(content)` (splits `---\n…\n---` →
`{attrs, keys, body}`), `bodyOf(filePath)`, the `PROVENANCE_REF`
(`/\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i`) and `SHELL_INJECTION_PATTERN`
(`/!`[^`]*`/`) constants, and the `ROLES` array. Path anchors:
`ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')`,
`REPO_ROOT = join(ADAPTER_DIR, '..', '..')`,
`SHARED_AGENTS_DIR = join(REPO_ROOT, 'agents')`,
`sharedAgentPath(role) = join(SHARED_AGENTS_DIR, \`${role}.md\`)`,
`aiderAgentPath(role) = join(ADAPTER_DIR, 'agents', \`craft-${role}.md\`)`.

KEY DIFFERENCE from cursor: the aider agent file has no frontmatter, so DO NOT run
`parseFrontmatter` on it (it would throw "missing opening frontmatter fence"). Compare the
RAW file bytes to `bodyOf(sharedAgentPath(role))`, and assert the raw file does NOT start with
`---`. There is NO `hooks.json`, NO guard hook, NO `skills/craft-run/SKILL.md`, NO
`.cursor`-schema frontmatter assertions — delete those describe blocks from the cursor model.

### TDD steps

- RED — write `native-surface.test.js`; it fails because `adapters/aider/` is empty:
  - byte-identity, per role: `readFileSync(aiderAgentPath(role),'utf8') === bodyOf(sharedAgentPath(role))`.
  - no-frontmatter, per role: `assert.doesNotMatch(readFileSync(aiderAgentPath(role),'utf8'), /^---/)`.
  - hygiene, per role: aider file body carries no `PROVENANCE_REF`, no `SHELL_INJECTION_PATTERN`.
  - README honesty pins (regex over `README.md`): (1) guard NO-GO / no deny-capable pre-execution
    hook; (2) unsandboxed shell surface (a `--test-cmd` wrote outside the repo — measured);
    (3) exit-code-is-not-success (Aider exits 0 on a hard API error with no commit — the commit
    is the success signal); (4) git-ext-diff predicate is moot (Aider drives git internally, never
    shells `git diff`). Also assert README states auth is env/file, not keychain.
  - config template (regex over `config.template.yml`): contains `read: [CONVENTIONS.md]`, the
    posture keys above, and the three tier ids; carries no `PROVENANCE_REF`.
  - hygiene over the non-agent surfaces (`README.md`, `config.template.yml`): no `PROVENANCE_REF`,
    no `SHELL_INJECTION_PATTERN`.
- GREEN — create the 9 body-only agent files (copy each shared body exactly), the
  `config.template.yml`, and the `README.md` with the four honesty lines + auth note.
- REFACTOR — dedupe path helpers; confirm the shared `agents/<role>.md` bodies are the byte
  source (no hand-editing) so a future shared-body change is caught by this test.

### Gate

- Part gate: `node --test adapters/aider/test/native-surface.test.js`
- Phase gate: `bash scripts/ci.sh`

### Commit

`feat(aider): role agents + config template + README + native-surface honesty pins`

## Part 2 — model tier map

### Context

CREATE `adapters/aider/src/model-tier-map.js` + `adapters/aider/test/model-tier-map.test.js`.
Mirror `adapters/cursor/src/model-tier-map.js` (read it first) — same own-property
`resolveTierValue(tier, defaults, overrides, label)` private helper (uses `Object.hasOwn`,
throws `${label}: unknown tier "${tier}" has no override and no default` on a miss), same
frozen default map, same public resolver shape.

Aider-pinned ids (live `--list-models` catalogue, `docs/adapters/aider-poc-record.md`):
`opus → anthropic/claude-opus-4-6`, `sonnet → anthropic/claude-sonnet-4-6`,
`haiku → anthropic/claude-haiku-4-5`. Aider bakes NO effort into the id (reasoning effort is
the separate `--reasoning-effort` flag) — so the map is a plain tier→id, no effort suffix.

Exports (adapter-internal — see Public-surface): `AIDER_TIER_MODELS` (frozen) and
`resolveAiderModel(tier, overrides = {})`.

### TDD steps

- RED — write `model-tier-map.test.js` (mirror the cursor test): `resolveAiderModel('opus')` →
  `anthropic/claude-opus-4-6`; `sonnet` → `anthropic/claude-sonnet-4-6`; `haiku` →
  `anthropic/claude-haiku-4-5`; an override wins over the default; an unknown tier (`'turbo'`)
  throws `/unknown tier "turbo"/`; an inherited-member tier (`'constructor'`) throws
  `/unknown tier/` (own-property discipline); `AIDER_TIER_MODELS` is frozen. Fails — module absent.
- GREEN — implement the frozen map + `resolveAiderModel` over the shared resolver pattern.
- REFACTOR — confirm no magic strings beyond the three pinned ids; the resolver is loud on miss.

### Gate

- Part gate: `node --test adapters/aider/test/model-tier-map.test.js`
- Phase gate: `bash scripts/ci.sh`

### Commit

`feat(aider): model tier map`

## Part 3 — launch-args posture

### Context

CREATE `adapters/aider/src/launch-args.js` + `adapters/aider/test/launch-args.test.js`.
Mirror the discipline of `adapters/cursor/src/launch-args.js` (discrete flag+value pairs,
never interpolated; fail-loud on empty model) — but Aider's posture differs:

- **NO working-dir flag.** Aider has no `--workspace`; cwd IS the git root, set by the runner
  as the spawn `cwd` (out of module scope). `buildLaunchArgs` emits nothing for the working dir.
- Signature: `buildLaunchArgs({ model, readFiles = [], message })`.
- Emitted argv, in order:
  `['--yes-always', '--no-gitignore', '--no-check-update', '--no-show-release-notes',
  '--no-analytics', '--model', model, ...(each readFile → '--read', file), '--message', message]`.
  The non-interactivity flags are REQUIRED — without `--yes-always` a headless run in a git repo
  blocks on the "Add .aider* to .gitignore?" prompt and crashes on non-terminal stdin
  (`KeyError: '0 is not registered'`, pinned in the poc-record).
- Assertions (fail loud, never silent-forward):
  - `model` a non-empty string, else throw (`buildLaunchArgs: model must be a non-empty string
    (resolve the tier first)`) — an empty `--model` silently defaults, changing which model ran.
  - `message` a non-empty string, else throw — an empty `--message` is a caller error.
  - `readFiles` an array; each entry a non-empty string, else throw. Each becomes a discrete
    `--read`,`<file>` pair (repeatable), never one interpolated string.

Export (adapter-internal): `buildLaunchArgs`.

### TDD steps

- RED — write `launch-args.test.js`:
  - given `{model:'anthropic/claude-sonnet-4-6', readFiles:['/abs/CONVENTIONS.md'], message:'go'}`
    → exact `deepEqual` of the full argv above (order-pinned).
  - the posture flags are present and there is NO `--workspace`/`--working-dir`/`--cwd` token.
  - `--model` value and each `--read` value are discrete (index-of + 1), never interpolated.
  - two readFiles → two discrete `--read`,`<file>` pairs, message stays last.
  - empty `readFiles` → no `--read` token; `--message` still last.
  - empty/non-string `model` → throws `/non-empty string/`.
  - empty/non-string `message` → throws.
  - a readFiles entry that is empty/non-string → throws.
- GREEN — implement with named flag constants + the three assertions.
- REFACTOR — extract the read-pair builder; early-return guards; no nesting > 2.

### Gate

- Part gate: `node --test adapters/aider/test/launch-args.test.js`
- Phase gate: `bash scripts/ci.sh`

### Commit

`feat(aider): launch-args posture`

## Part 4 — first-class VCS posture + reset-on-red helper

### Context

CREATE `adapters/aider/src/vcs-posture.js` + `adapters/aider/test/vcs-posture.test.js`.
This is the decision-C first-class VCS port. Two exports (adapter-internal):

- `buildVcsPostureArgs()` — no params; returns the frozen-per-call posture argv:
  `['--auto-commits', '--no-dirty-commits', '--no-attribute-author', '--no-attribute-committer',
  '--no-attribute-co-authored-by']`. `--auto-commits` keeps Aider's commit (the handoff);
  `--no-dirty-commits` gives a deterministic one-commit-per-turn artifact; the three
  `--no-attribute-*` flags keep commits one-line-conventional (decision B). Return a fresh
  array each call (immutable-by-default; no shared mutable module state).
- `reconcileGateOutcome({ gateOutcome, preTurnHead })` — the PURE decision-F helper (query, no
  side effects). Given a gate outcome and the captured pre-turn HEAD, return the reconcile action:
  `gateOutcome === 'green'` → `{ action: 'accept' }` (keep the auto-commit);
  otherwise → `{ action: 'reset', target: preTurnHead }` (reset the branch to the pre-turn HEAD so
  no red-gated commit survives). The actual `git reset` is runner/orchestrator behaviour — OUT of
  this module. `preTurnHead` a non-empty string when a reset is returned, else throw
  (a reset with no target is a caller error — fail loud, never a silent no-target reset).

### TDD steps

- RED — write `vcs-posture.test.js`:
  - `buildVcsPostureArgs()` deep-equals the exact five-flag posture (order-pinned); attribution is
    all three `--no-attribute-*`; `--auto-commits` and `--no-dirty-commits` present.
  - two calls return distinct array instances (no shared mutable state).
  - `reconcileGateOutcome({gateOutcome:'green', preTurnHead:'abc123'})` → `{action:'accept'}`
    (the pre-turn HEAD is not referenced on accept).
  - `reconcileGateOutcome({gateOutcome:'red', preTurnHead:'abc123'})` →
    `{action:'reset', target:'abc123'}`.
  - any non-green outcome (e.g. `'error'`) → a reset to `preTurnHead` (green is the only accept).
  - `reconcileGateOutcome({gateOutcome:'red', preTurnHead:''})` → throws (no reset target).
- GREEN — implement both functions; early returns; named flag constants.
- REFACTOR — confirm CQS (query-only helper, no logging/mutation) and immutability.

### Gate

- Part gate: `node --test adapters/aider/test/vcs-posture.test.js`
- Phase gate: `bash scripts/ci.sh`

### Commit

`feat(aider): first-class VCS posture + reset-on-red helper`

## Part 5 — acceptance probe

### Context

CREATE `adapters/aider/src/probe.js` + `adapters/aider/test/probe.test.js`.
Model on `adapters/cursor/src/probe.js` and `adapters/cursor/test/probe.test.js` (read both).
Wraps the shared harness `runProbeHarness` from `engine/src/probe-harness.js` (signature:
`runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs })`).

- Imports: `runProbeHarness` (`../../../engine/src/probe-harness.js`), `buildLaunchArgs`
  (`./launch-args.js`), `resolveAiderModel` (`./model-tier-map.js`), `buildVcsPostureArgs`
  (`./vcs-posture.js`).
- `PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate', 'VCS'])` — the four-port set
  (VCS is first-class here; **Gate** is craft's never-commit-on-red build gate, green-before-accept,
  NOT a tool deny-hook).
- `PROBE_TIER = 'sonnet'` (the harness drives its construction phase at sonnet).
- Export `runAcceptanceProbe({ aiderRunner, fsOps })` → delegates to `runProbeHarness` with
  `versionKey: 'aiderVersion'`, `portsExercised: PORTS_EXERCISED`, and
  `extraRunnerArgs: (targetPath) => ({ launchArgs: [...buildLaunchArgs({ model:
  resolveAiderModel(PROBE_TIER), readFiles: [], message: 'probe: construct' }),
  ...buildVcsPostureArgs()] })`. The runner is INJECTED — no real `aider` spawn. Aider needs no
  workspace flag, so (unlike cursor) the launch argv does not carry `targetPath`; the runner scopes
  the session by setting the spawn `cwd` to `targetPath`.

Harness trace contract (from `engine/src/probe-harness.js`): the injected runner returns a trace
`{ aiderVersion, model, gateOutcome, gateRanBeforeCommit, committedArtifact, mutatedPaths, phases }`.
The harness passes only when `gateOutcome==='green' && gateRanBeforeCommit===true`, a non-empty
`committedArtifact`, and every `mutatedPaths` entry inside `targetPath`. Model Aider's
commit-then-gate order honestly: the runner reports `gateRanBeforeCommit=true` only when the gate
ran GREEN before the auto-commit was **accepted** (not reset) — i.e. the reconcile (Part 4) chose
`accept`. A red gate → the commit is reset → treat as commit-not-accepted → probe fails.

### TDD steps

- RED — write `probe.test.js` (mirror the cursor probe test's `greenTrace` helper, keyed to
  `aiderVersion`):
  - a green trace → `passed===true`, `evidence.aiderVersion` echoed,
    `evidence.portsExercised` deep-equals `['Execution','Model','Gate','VCS']`.
  - the injected runner receives the aider launch argv: `--model` value is the resolved sonnet id
    `anthropic/claude-sonnet-4-6`, the VCS posture flags are present (`--auto-commits`,
    `--no-attribute-co-authored-by`), and there is NO `--workspace`/`--working-dir` token; the
    runner is invoked with `workingDir === targetPath` (cwd-scoping).
  - a trace with `gateOutcome:'red'` → `passed===false` (never-commit-on-red).
  - a trace whose `mutatedPaths` escape the throwaway (e.g. `['/etc/passwd']`) → `passed===false`.
  - a trace with `committedArtifact:null` → `passed===false` (the commit IS the handoff).
  - `fsOps = { mktemp: async () => THROWAWAY }`; no test spawns a real CLI.
- GREEN — implement `runAcceptanceProbe` as the thin wrapper above.
- REFACTOR — confirm the wrapper adds no logic beyond port list + launch-arg composition.

### Gate

- Part gate: `node --test adapters/aider/test/probe.test.js`
- Phase gate: `bash scripts/ci.sh`

### Commit

`feat(aider): acceptance probe`

## Part 6 — telemetry adapter for the persisted chat transcript

### Context

CREATE `engine/src/observability/adapters/aider/telemetry.js` + `engine/test/aider-telemetry.test.js`.
CONSUME fixture `engine/test/fixtures/aider/real-session.md` — the REAL captured transcript
(provided separately; it MUST exist when this part runs — if absent, raise a blocker, do not
fabricate it). Pinned numbers in that fixture: `> Tokens: 781 sent, 19 received.` →
`{ input: 781, cacheRead: 0, cacheCreation: 0, output: 19 }`.

Model on `engine/src/observability/adapters/codex/telemetry.js` and its test
`engine/test/codex-telemetry.test.js` (read both) for the `parseLines`/`skipped`/`markers`
contract, the `numOrZero`/`toEpochMs`/`tsBeforeCutoff` helpers, and the redaction whitelist. But
Aider persists **markdown**, not JSON — there is NO live JSON stream.

`parseLines(lines, since = null)` scans the async line iterable of `.aider.chat.history.md`:

- **Token line** (the ONLY pinned token form): match `/^> Tokens: (\d+) sent, (\d+) received\./`
  against the trimmed line (anchored start, NO end anchor so a trailing ` Cost: …` clause on a
  paid line still yields the event; `sent → input`, `received → output`). On a match, emit an event
  with `tokens = { input: Number(sent), cacheRead: 0, cacheCreation: 0, output: Number(received) }`.
  A line that STARTS `> Tokens:` but does NOT match the two-integer shape — a `k`/`M`/comma
  large-count (`1.2k sent`, `1,234 sent`) or the unpinned `Cost:`-only form — is a **counted skip**
  (`skipped++`), never a silent-zero event. (The anchored-digits regex rejects `1,234`/`1.2k`
  because the digit run is not immediately followed by ` sent`.)
- **Model header:** `/^> Model: (\S+)/` — hold the captured id (first non-space token, e.g.
  `ollama_chat/qwen2.5-coder:7b` from `> Model: … with whole edit format`) as the current model,
  stamped onto subsequently-emitted events; null before any Model header.
- **Session-start header:** `/^# aider chat started at (.+)$/` — hold the captured timestamp string
  as the current session-start ts. Aider transcripts carry NO session id → `run: null` for every
  event (the codex-absent pattern).
- **`since` cutoff** (ISO string): when set and the current session-start ts predates it
  (`tsBeforeCutoff(currentStartTs, since)` via `toEpochMs`/`Date.parse`), drop the block's token
  events (internal filter, never emitted). NOTE: the started-at header is a local-naive timestamp
  (`Date.parse` reads it as local time); the since tests use far-apart boundaries (past/future,
  the codex 2000/2099 pattern) — the TZ-exact boundary is not pinned and is out of scope.
- Every emitted event: `{ run: null, slug: null, phase: null, role: null, model: <held|null>,
  tokens: {…}, cacheCreationTtl: null, messages: 1, durationMs: 0 }`. `markers` is always `[]`
  (Aider emits no auto-skip signal text). Never throws on a hostile line.

Exports (engine/src public — see Public-surface; wired into the miner in Part 7; Stryker
`engine/src/**/*.js` auto-covers): `parseLines` and a small pure token mapper (mirror the sibling
`tokensFromCursorUsage`/`tokensFromCodexUsage` export for unit + mutation coverage), e.g.
`tokensFromAiderCounts({ sent, received })`.

The neutral UsageEvent field set (redaction whitelist, from the codex test): `['run', 'slug',
'phase', 'role', 'model', 'tokens', 'cacheCreationTtl', 'messages', 'durationMs']`.

### TDD steps

- RED — write `aider-telemetry.test.js` (use `readFileSync(...).split('\n')` + an `asyncLines`
  generator, the codex-test helpers; build synthetic markdown line arrays inline for edge cases):
  - real fixture `real-session.md` → exactly one event; `tokens` deep-equals
    `{input:781, cacheRead:0, cacheCreation:0, output:19}`; `skipped===0`; `model` is the held
    `> Model:` id; `run===null`; `markers` is `[]`.
  - token mapper unit: `tokensFromAiderCounts({sent:781, received:19})` →
    `{input:781, cacheRead:0, cacheCreation:0, output:19}`; non-finite inputs coerce to 0.
  - malformed token line `> Tokens: 1.2k sent, 340 received.` → `skipped===1`, zero events
    (no silent-zero); `> Tokens: 1,234 sent, 56 received.` → `skipped===1`, zero events.
  - paid form `> Tokens: 781 sent, 19 received. Cost: $0.02 message, $0.15 session.` → one event
    with 781/19 (the Cost clause is ignored, the two ints still map).
  - model held: a `> Model: X with whole edit format` header then a token line → event `model==='X'`;
    a token line before any Model header → `model===null`.
  - `since`: a session whose `# aider chat started at` ts predates a future `since` → its token
    events dropped; a session after a past `since` → kept.
  - redaction whitelist: `Object.keys(event).sort()` equals the neutral field set;
    role/phase/slug/cacheCreationTtl null; `messages===1`; `durationMs===0`.
  - empty input → `{events:[], skipped:0, markers:[]}`; structurally hostile lines never throw.
- GREEN — implement `parseLines` + the token mapper + the header holders per the regexes above.
- REFACTOR — extract the line classifiers (isTokenLine/isModelHeader/isStartHeader); early returns;
  no nesting > 2; no swallowed errors (the skip is counted, not swallowed).

### Gate

- Part gate: `node --test engine/test/aider-telemetry.test.js`
- Phase gate: `bash scripts/ci.sh`

### Commit

`feat(aider): telemetry adapter for the persisted chat transcript`

## Part 7 — wire `--source aider` into the usage miner

### Context

EDIT `engine/src/observability/usage-mine-main.js`; extend `engine/test/usage-mine-main.test.js`.
Read the current miner (already explored). Exact edit sites:

1. **Import** (after line 33, next to the other `parseLines` imports):
   `import { parseLines as aiderParseLines } from './adapters/aider/telemetry.js';`
2. **`SOURCES`** (the frozen map, lines 43–49): add `aider: aiderParseLines,` as the last entry.
   This is the registry that also drives the `unknown --source` error listing
   (`unknownSourceMessage` joins `Object.keys(SOURCES)` with `|`) and the own-property gate at
   line 252 — no other change needed there.
3. **`DEFAULT_READ_ROOTS`** (the frozen thunk map, lines 55–71): add
   `aider: () => process.cwd(),`. Aider writes `.aider.chat.history.md` at the git root, which is
   the working dir craft runs in (= `repoRoot`'s default, `process.cwd()`). Document the caveat
   (mirror the codex boundary note): the default assumes cwd IS the git root; a sub-directory cwd
   needs an explicit `--dir`. `resolveDefaultReadRoot` (line 78, exported) already routes through
   this map with a claude fallback — no change to it.
4. **Per-source file matcher** — generalize the hardcoded `.jsonl` discovery filter. Add, next to
   `DEFAULT_READ_ROOTS`, a frozen `SOURCE_FILE_MATCHERS` map and an exported
   `resolveFileMatcher(source)` mirroring `resolveDefaultReadRoot` (own-property `Object.hasOwn`,
   default/claude fallback): default matcher `(f) => f.endsWith('.jsonl')`; `aider` matcher
   `(f) => f === '.aider.chat.history.md'` (exact — must not also catch `.aider.input.history`
   /`.aider.llm.history`). At line ~272 replace
   `readdirSync(safeTranscriptDir).filter(f => f.endsWith('.jsonl'))` with
   `readdirSync(safeTranscriptDir).filter(resolveFileMatcher(source))`.
5. **`NO_FILES_NOTE`** (line 91, `'no .jsonl transcript files found'`) stays UNCHANGED — the
   existing exact-string test (`usage-mine-main.test.js` ~line 500) pins it for the claude/default
   source, and a per-source no-files note is deliberately OUT of bounded scope here (a cosmetic
   inaccuracy on a zero-file aider mine; advisory-only). Document this bounded call in a comment.

Exported (engine/src test seam — see Public-surface): `resolveFileMatcher` (new),
`resolveDefaultReadRoot` (existing). Stryker `engine/src/**/*.js` auto-covers this file.

The miner's own-property `SOURCES` gate + the reserved-key `resolveDefaultReadRoot` tests
(`__proto__`/`constructor`/`hasOwnProperty` → claude fallback) MUST stay green — adding `aider`
does not affect them.

### TDD steps

- RED — extend `usage-mine-main.test.js` (mirror the `--source codex` block, ~lines 1092–1203):
  - `--source aider` is ACCEPTED (not a config-error non-zero exit).
  - over a fixture dir containing `.aider.chat.history.md` (copy `engine/test/fixtures/aider/
    real-session.md` into a temp dir under that exact filename; pass `projectsRoot` = its parent
    for containment, and `--dir <that dir>`) → `report.runs.length > 0`, and a mined group's
    `tokens` has `input===781 && output===19` (the aider parser ran).
  - `resolveFileMatcher('aider')('.aider.chat.history.md') === true`;
    `resolveFileMatcher('aider')('x.jsonl') === false`;
    `resolveFileMatcher('claude')('x.jsonl') === true`;
    a reserved-member source (`'constructor'`) → the default `.jsonl` matcher (own-property).
  - `resolveDefaultReadRoot('aider') === process.cwd()` (dynamic, not a literal).
  - the `unknown --source` message lists `aider` among the expected sources; the existing
    `includes('claude|opencode')` substring assertion still holds (aider appends at the tail).
  - a mixed dir under `--source aider` containing BOTH `.aider.chat.history.md` and a stray
    `x.jsonl` → only the `.aider.chat.history.md` is discovered (per-source matcher, not `.jsonl`).
- GREEN — apply edits 1–4 above.
- REFACTOR — confirm the matcher seam is symmetric with `DEFAULT_READ_ROOTS` (same own-property
  shape); no duplicated filter literal left behind; the bounded `NO_FILES_NOTE` comment is present.

### Gate

- Part gate: `node --test engine/test/usage-mine-main.test.js`
- Phase gate: `bash scripts/ci.sh`

### Commit

`feat(aider): wire --source aider into the usage miner`

## Part 8 — ci suite wiring + BACKLOG binding entry

### Context

**Standalone** (test-infra/docs; no `src/` delta). Two files:

1. `scripts/ci.sh` — add the adapter suite line and guard against the installed real `aider`.
   - After the cursor suite line (currently line 57,
     `run_suite adapters/cursor adapters/cursor/test adapters/cursor`) insert:
     `run_suite adapters/aider adapters/aider/test adapters/aider`. (`run_suite` hard-errors on a
     zero-file enumeration, so this requires Parts 1–5 to have landed the adapter test files —
     they have, in sequence.)
   - **aider PATH stub.** The memory lesson + the task require a fast-failing `aider` stub on PATH
     because `aider` IS installed on this box and a real spawn would hang ci.sh. VERIFIED at plan
     time: the current `scripts/ci.sh` carries NO agent-binary stub prelude (grep confirms; the
     pi/copilot/cursor-agent suites are fully injected, as is this aider suite — no adapter test
     spawns a real binary). So: FIRST re-grep `scripts/ci.sh` for an established agent-binary stub
     block; if one exists by implementation time, mirror it for `aider`. If none exists (the
     current state), add a minimal, well-commented fast-fail `aider` shim to PATH near the top of
     ci.sh (right after the repo-root `cd`), e.g. prepend a stub dir whose `aider` script does
     `echo "ci: real aider must not run in ci (suite is injected)" >&2; exit 1`, so any accidental
     real spawn fails LOUD instead of hanging. Confirm the full suite stays green (no injected test
     regresses — none call `aider`). If, at implementation time, it is confirmed that NO enumerated
     test path can reach a real `aider` and the reviewer prefers no dead plumbing, record that as a
     one-line rationale rather than adding an inert shim — but default to the task-mandated shim.
2. `BACKLOG.md` — add ONE binding-outcome entry. Place it under `## Candidate phases` →
   `### Open` (mirror the Cursor bullet at ~line 462 and the Antigravity two-verdict bullet at
   ~line 438). Required backlog sections (`## Status`, `## Candidate phases`, `## Parked`,
   `### Condition-gated`, `### Closed`) MUST remain present (`backlog-lint.sh` gate). The entry
   captures: **execution GO** (runnable adapter built at `adapters/aider/` — role agents,
   model-tier map, launch-args, first-class VCS posture + reset-on-red, probe, telemetry +
   `--source aider` miner wiring), the measured pins (exit-code-is-not-success → the commit is the
   handoff; unsandboxed shell; git-ext-diff predicate MOOT; env/file auth, no keychain;
   attribution disabled → one-line-conventional), **guard NO-GO** (no deny-capable pre-execution
   hook, `--yes-always` auto-approves, `--no-verify` commits bypass git hooks — declined honestly,
   the copilot/antigravity precedent), and the **re-open Trigger** (Aider ships a pre-tool
   deny-capable hook → re-run the Phase 0 guard gate). NO ADR number is minted (this plan opens
   no ADR); write no `Part N`/phase ref in the entry. Full record cite:
   `docs/adapters/aider-poc-record.md`.

### TDD steps

- RED — run `bash scripts/ci.sh` BEFORE the edit: the aider adapter tests + engine telemetry/miner
  tests exist and pass, but ci.sh does not yet run the `adapters/aider` suite (it is not
  enumerated) — the wiring is missing. (`backlog-lint.sh BACKLOG.md` is already green.)
- GREEN — add the `run_suite adapters/aider …` line, the aider PATH stub, and the BACKLOG entry.
- REFACTOR — confirm `run_suite adapters/aider` sits next to the other adapter suites; the stub is
  minimal and commented; `bash scripts/backlog-lint.sh BACKLOG.md` still lists all required
  sections; the entry carries no provenance ref beyond the poc-record path.

### Gate

- Part gate: `bash scripts/ci.sh` (exercises the new `run_suite adapters/aider` + the stub) and
  `bash scripts/backlog-lint.sh BACKLOG.md`
- Phase gate: `bash scripts/ci.sh`

### Commit

`chore(aider): ci suite wiring + BACKLOG binding entry`
