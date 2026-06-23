# Plan — P13: NFR hardening (bin mutation coverage · model-class matrix)

> Source: design doc `docs/DESIGN-P13-nfr-hardening.md` · ADRs `065, 066, 067, 068`
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  mutation/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.

## Decision candidates

**None — pre-decided by ADRs 065-068.** ADR-065 (no engine telemetry, no speed baseline,
no subagent self-report — so this plan schedules ZERO telemetry/baseline work), ADR-066
(extract bin glue to `engine/src/<bin>-main.js`; keep `mutate: ["engine/src/**/*.js"]`
unchanged; never widen to `engine/bin/**`), ADR-067 (in-process units on each new src module
+ retained child-process smoke; bump `EXPECTED_TESTS` in the landing commit), ADR-068
(deterministic R10 shape-stability guard CI-gated + a documented, not-CI-gated live matrix
procedure). The per-bin convert/skip calls below are planning judgments *inside* ADR-066's
"convert only when the glue carries mutation-worthy logic" rule — not open candidates.

## Per-bin convert/skip ruling (ADR-066 rule applied — read each bin before acting)

Assessed all six run-on-import bins by their *residual glue* (the logic reachable only through
the bin, never through an already-`engine/src/` function). CONVERT when that glue carries
killable branches; SKIP when it is a bare-arg pass-through already smoke-covered.

| Bin | Ruling | One-line why |
|---|---|---|
| `pipeline-resolve.js` | **CONVERT** (Part 1) | Richest glue: `REPO_ROOT`, `roleExists` craft-prefix + `/`,`\` traversal guard + `existsSync`, `parseArgs`/`takeValue` (positional fill, `--profile`/`--skip` csv split·trim·filter, unknown-flag, flag-as-value), the `!resolution.ok` error loop, the usage branch. |
| `contract-assemble.js` | **CONVERT** (Part 2) | Multi-flag `parseArgs`/`takeValue` (4 flags, `--`-prefixed-value guard), `loadFragments` over `BUNDLE_VOCAB`, descriptor `.find` + unknown-id error listing known ids, missing-`--descriptor-id` usage, `inline`→`opts.execution` mapping. |
| `manifest-lint.js` | **CONVERT** (Part 3) | Real glue with NO existing bin test: `resolveManifestPath` default, `isRegularFile` try/catch predicate, `buildFileExists` `dirname(dirname())` ROOT + join-or-bare fallback, frontmatter-null branch, YAML-parse catch, `failInvalid` block. |
| `normalize-findings.js` | **CONVERT** (Part 4, lean) | Small but mutation-worthy: `argv[2] || null` empty-string→stdin nuance, `readFileSync(0)` fd-0 vs file branch, the `fail` helper, two try/catch exits. Smoke test exists to retain. |
| `pipeline-lint.js` | **SKIP** | Glue is a bare `argv[2]` + usage guard + `!ok` error loop — pure pass-through to `parsePipeline`/`validatePipeline`; no closures, no parsing. Not mutation-worthy; already smoke-exercised by `ci.sh` line 24. |
| `contracts-lint.js` | **SKIP** | Residual is `resolve(argv[2] ?? 'contracts')` + a failures loop; the bundle-validation logic already lives behind `BUNDLE_VOCAB` and is thoroughly child-process-tested in `contracts-lint.test.js`. Not worth a module. |

## Public-surface decision (settled up front)

Every new `engine/src/<bin>-main.js` exports exactly one symbol: `main(argv, io)`. **All four are
INTERNAL** — imported only by their sibling `engine/bin/<bin>.js` entrypoint and their own
`engine/test/<bin>-main.test.js`. They are **NOT** added to the barrel `engine/src/index.js`
(verified: today the barrel re-exports only `parsePipeline`, `validatePipeline`, `ALIAS_MAP`,
`resolveAlias`, `resolvePipeline`, `assembleContract`, `normalizeFindings`, `validateManifest` —
no `*-main` entry, and the bins import their *logic* deps directly from `../src/<dep>.js`, not via
the barrel). There is no facade, no exhaustiveness switch, no generated API report, and no registry
in this repo that enumerates src modules — the only surface gate is Stryker's `mutate:
["engine/src/**/*.js"]` glob, which auto-covers the new modules with **no config change** (ADR-066:
do NOT touch `engine/stryker.conf.json`, do NOT widen to `engine/bin/**`). So no surface gate to
pre-pay beyond keeping each `main` out of `index.js`.

## Provenance rule (all parts)

No phase/ADR/backlog numbers in source or test (design docs carry provenance). Error strings keep
their existing `<bin>:` prefixes; test titles and JSDoc name behaviour, never `ADR-0xx`/`P13`.

## EXPECTED_TESTS bookkeeping (binding)

`scripts/ci.sh` line 10 is `EXPECTED_TESTS=448` (verified: `node --test 'test/**/*.test.js'` →
`# tests 448`). The ONLY edit any part makes to `ci.sh` is this number (ADR-066/067: the converted
bins keep their existing paths, so `ci.sh` line 24 already references them — add NO new `ci.sh`
invocation). **Each test-adding part, in its own landing commit: run the part gate, read the
`# tests` line, set `EXPECTED_TESTS` to that exact number.** The per-part counts below are
projections to size the work; the authoritative number is whatever `node --test` prints for that
part. Projected trajectory: 448 → ~460 (S1) → ~470 (S2) → ~479 (S3) → ~485 (S4) → ~491 (S5);
S6 is docs-only, no bump. **Projected final `EXPECTED_TESTS` ≈ 491** (each part reconciles to the
real count).

## Part 1 — pipeline-resolve: extract glue to src/pipeline-resolve-main.js

### Context

**Mutation-scored** target (`engine/src/**/*.js`, per `engine/stryker.conf.json`). The new module
is auto-covered by the unchanged glob.

**File to create — `engine/src/pipeline-resolve-main.js`.** Move ALL current top-level logic out of
`engine/bin/pipeline-resolve.js` (read it whole, 109 lines) into an exported
`export function main(argv, io)` returning the exit code (`number`), where `argv` is
`process.argv.slice(2)` and `io = { stdout, stderr }` with `.write(string)` methods. Replace every
`process.stderr.write(...)` with `io.stderr.write(...)`, every `process.stdout.write(...)` with
`io.stdout.write(...)`, and every `process.exit(N)` with `return N` (the function never calls
`process.*`). The `takeValue` closure currently calls `process.stderr.write` + `process.exit(2)`
inside `parseArgs`; rework so `parseArgs` signals the option-error to `main` (e.g. `takeValue`
writes to `io.stderr` and `main` returns `2`) — `parseArgs` must take `io` (and may return a
sentinel/throw a local typed error caught in `main`) so NO `process.*` survives in src. Keep
behaviour byte-identical:

- `REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')` — note the module now lives
  in `engine/src/`, so the `'..','..'` walk still lands on the repo root (src is one dir below bin's
  `engine/bin`; both are two dirs under root — verify the join resolves to repo root from `engine/src`).
- `CRAFT_PREFIX = 'craft:'`; `roleExists(ref)` — non-craft refs → `true`; craft name containing
  `/` or `\` → `false` (traversal guard, **before** the existence probe); else
  `existsSync(join(REPO_ROOT, 'agents', name + '.md'))`.
- `parseArgs`: positional fill (1st=`pipelinePath`, 2nd=`manifestPath`), `--profile <val>`,
  `--skip <csv>` (`.split(',').map(trim).filter(Boolean)`), `takeValue` rejects a value that is
  `undefined` or `startsWith('-')` with `pipeline-resolve: option <flag> requires a non-flag value`
  + exit 2, unknown `-`-prefixed flag → `pipeline-resolve: unknown option <arg>` + exit 2.
- Usage when `!pipelinePath`: `Usage: pipeline-resolve <pipeline.yml> [manifest.yml] [--profile <name>] [--skip <csv>]` + exit 2.
- `parsePipeline(readFileSync(pipelinePath))` in try/catch → `pipeline-resolve: failed to parse pipeline: <msg>` exit 2.
- optional manifest via `parseManifestContent` → `failed to parse manifest` exit 2.
- `applyCliOverlay(manifest ?? {}, { profile, skip })`, then
  `resolvePipeline(defaults, effectiveManifest, { roleExists })` in try/catch → `pipeline-resolve: <msg>` exit 2.
- `!resolution.ok` → write each `  - <error>\n` to stderr, exit 2.
- success: `io.stdout.write(JSON.stringify(resolution, null, 2) + '\n')`, return 0.

Imports the module needs (currently in the bin): `readFileSync, existsSync` from `node:fs`;
`join, dirname` from `node:path`; `fileURLToPath` from `node:url`; `parsePipeline` from
`./descriptor.js`; `resolvePipeline` from `./resolve.js`; `applyCliOverlay` from `./cli-overlay.js`;
`parseManifestContent` from `./frontmatter.js`.

**File to shrink — `engine/bin/pipeline-resolve.js`.** Becomes the thin guard:

```
#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from '../src/pipeline-resolve-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
```

**New test file — `engine/test/pipeline-resolve-main.test.js`** (in-process units). Import `main`
directly; build a capturing `io` (`{ stdout: { writes:[], write(s){this.writes.push(s)} }, stderr: {…} }`),
call `main(argv, io)`, assert the returned exit code + joined `io.stdout`/`io.stderr` strings. Drive
every branch the child-process test drove (read `engine/test/pipeline-resolve.bin.test.js`, 199 lines,
for the fixtures and expected behaviours): `--profile lean`, `--skip decisions`, CLI-`--profile solo`
overriding manifest `profile: full`, flag-after-positional, `with-body.md` frontmatter, unknown
`--bogus`, `bad-role.md` (exit 2 naming `implementation` + `craft:plannr`), `good-role.md` (exit 0),
`external-role.md` (exit 0), `traversal-role.md` (exit 2), `enable-requirements.yml`,
`enable-architecture.yml`, `enable-both.yml`. Reuse fixture paths under
`engine/test/fixtures/manifests/` and `pipeline/default.yml` (build absolute paths via
`fileURLToPath`/`join` as the existing test does). Add a unit for the `takeValue` flag-as-value
branch (`--profile --skip` → exit 2 naming `--profile`) — the child-process test omits it.

**Retain as smoke** — `engine/test/pipeline-resolve.bin.test.js` UNCHANGED: it is the sole end-to-end
assertion that the real entrypoint exits with the right `process.exit` code and wires `process.argv`
(the guard line excluded from the mutate surface).

### TDD steps

- RED: add `engine/test/pipeline-resolve-main.test.js` importing `main` from the not-yet-created
  `../src/pipeline-resolve-main.js`. Expected failure: `ERR_MODULE_NOT_FOUND` (module missing).
- RED (after the module skeleton exists but logic not yet moved): each unit fails on wrong
  exit code / missing `io` write (e.g. `--profile lean` expects `implementation.execution === 'agent'`
  in parsed stdout JSON; bad-role expects return 2 + stderr matching `/craft:plannr/`).
- GREEN: create `engine/src/pipeline-resolve-main.js` with `main(argv, io)` (logic moved verbatim,
  `process.*` → `io`/`return`); shrink `engine/bin/pipeline-resolve.js` to the guard. Run units +
  the retained smoke → all green.
- REFACTOR: ensure `parseArgs`/`takeValue` carry no `process.*` (pass `io`); early-return on option
  error; no nesting >2; `roleExists`/`parseArgs` as small named helpers. Re-run gate.
- BUMP: set `EXPECTED_TESTS` in `scripts/ci.sh` to the new `# tests` count from the gate run.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`refactor(engine): extract pipeline-resolve glue to src for mutation coverage`

## Part 2 — contract-assemble: extract glue to src/contract-assemble-main.js

### Context

**Mutation-scored** target (`engine/src/**/*.js`). New module auto-covered by the unchanged glob.

**File to create — `engine/src/contract-assemble-main.js`** exporting `export function main(argv, io)`
→ exit code. Move ALL top-level logic out of `engine/bin/contract-assemble.js` (read it whole,
120 lines). Same `process.* → io/return` rewrite as Part 1; `parseArgs`/`takeValue` must take `io`
so no `process.*` survives in src. Preserve byte-identical behaviour:

- `__dir = dirname(fileURLToPath(import.meta.url))`, `REPO_ROOT = join(__dir, '..', '..')` (verify the
  walk lands on repo root from `engine/src`). `BUNDLE_NAMES = [...BUNDLE_VOCAB]`.
- `parseArgs`: `--descriptor-id <val>`, `--manifest <val>`, `--inline` (boolean), `--contracts-dir
  <val>` (default `join(REPO_ROOT, 'contracts')`). `takeValue` rejects `undefined`/`startsWith('--')`
  value with `contract-assemble: option <flag> requires a non-flag value` + exit 2 (note: this bin
  guards on `--` prefix, not `-`).
- `loadFragments(contractsDir)` = `Object.fromEntries(BUNDLE_NAMES.map(n => [n, readFileSync(join(contractsDir, n+'.md'),'utf8')]))`.
- Missing `--descriptor-id` → `Usage: contract-assemble.js --descriptor-id <id> [--manifest <path>] [--inline] [--contracts-dir <dir>]` + exit 2.
- pipeline parse from `join(REPO_ROOT, 'pipeline', 'default.yml')` via `parsePipeline` try/catch →
  `contract-assemble: failed to parse pipeline: <msg>` exit 2.
- `descriptors.find(d => d.id === descriptorId)`; not found → `contract-assemble: unknown descriptor-id "<id>". Known ids: <csv>` exit 2.
- optional manifest via `parseManifestContent(...) ?? {}` try/catch → `failed to parse manifest` exit 2.
- `loadFragments` try/catch → `contract-assemble: failed to load contract fragments: <msg>` exit 2.
- `assembleContract(descriptor, manifest, fragments, { execution: inline ? 'inline' : 'agent' })`
  try/catch → `contract-assemble: <msg>` exit 2.
- success: `io.stdout.write(block + '\n')`, return 0.

Imports the module needs: `readFileSync` from `node:fs`; `join, dirname` from `node:path`;
`fileURLToPath` from `node:url`; `parseManifestContent` from `./frontmatter.js`; `parsePipeline` from
`./descriptor.js`; `assembleContract` from `./contract.js`; `BUNDLE_VOCAB` from `./graph.js`.

**File to shrink — `engine/bin/contract-assemble.js`** → the thin guard (same shape as Part 1,
importing `../src/contract-assemble-main.js`).

**New test file — `engine/test/contract-assemble-main.test.js`** (in-process units). Import `main`;
capturing `io`; the bin reads `pipeline/default.yml` + `contracts/` relative to `REPO_ROOT` (computed
in-module from `import.meta.url`), so no `cwd` juggling is needed — `main([...], io)` works from the
test process. Drive every branch the child-process test drives (read
`engine/test/contract-assemble.test.js`, 198 lines): `--descriptor-id design` (agent core markers
`never commit on a red gate`/`Blocker protocol`/`provenance`/`suppression`/`Bounded scope`, producer
markers, agent carve-outs `the agent commit is the handoff`/`the role model resolved`),
`--descriptor-id design --inline` (`the session model`, `the commit is the handoff (no agent context
to lose)`, and NOT the agent variants), `--descriptor-id workspace` (contract:[] core-only),
`--descriptor-id nonexistent-phase` (exit 2), no `--descriptor-id` (exit 2), `--manifest --descriptor-id
design` (flag-as-value exit 2 naming `--manifest`), `--manifest engine/test/fixtures/manifests/with-body.md`
(exit 0 core marker), `--manifest …/with-context.md` (`GLOBAL_CONTEXT_SENTINEL` +
`DESIGN_CONTEXT_SENTINEL` present, `BODY_SENTINEL` absent), `--descriptor-id requirements` (producer),
`--descriptor-id architecture` (harness-exec), `--descriptor-id review` (harness-read). Manifest
fixture paths passed to `main` must be absolute (resolve via `fileURLToPath`/`join` from the test) OR
relative-to-repo-root strings — match what the in-module `readFileSync` expects (the bin currently
takes the `--manifest` value verbatim into `readFileSync`, so the child-process test passes
repo-root-relative paths under `cwd: repoRoot`; the in-process unit must pass absolute paths since the
test process `cwd` is `engine/`).

**Retain as smoke** — `engine/test/contract-assemble.test.js` UNCHANGED (end-to-end exit-code/argv).

### TDD steps

- RED: add `engine/test/contract-assemble-main.test.js` importing `main` from the missing
  `../src/contract-assemble-main.js` → `ERR_MODULE_NOT_FOUND`.
- RED: with the module present, marker/exit-code assertions fail until logic is moved.
- GREEN: create `engine/src/contract-assemble-main.js`; shrink the bin to the guard. Units + smoke green.
- REFACTOR: `parseArgs`/`takeValue`/`loadFragments` small named helpers, `io`-threaded, early returns,
  no `process.*` in src. Re-run gate.
- BUMP: reconcile `EXPECTED_TESTS` to the new `# tests` count.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`refactor(engine): extract contract-assemble glue to src for mutation coverage`

## Part 3 — manifest-lint: extract glue to src/manifest-lint-main.js

### Context

**Mutation-scored** target (`engine/src/**/*.js`). New module auto-covered. **No existing bin test**
for `manifest-lint` — this part is the first coverage of its glue (in-process units are the primary
layer; a thin child-process smoke is added too, per ADR-067).

**File to create — `engine/src/manifest-lint-main.js`** exporting `export function main(argv, io)` →
exit code. Move ALL top-level logic out of `engine/bin/manifest-lint.js` (read it whole, 91 lines).
`process.* → io/return`. Preserve byte-identical behaviour:

- consts `EXIT_OK = 0`, `EXIT_INVALID = 2`, `DEFAULT_MANIFEST = '.claude/workflow.md'`.
- `resolveManifestPath(argv)` = `argv[0] ?? DEFAULT_MANIFEST` (NOTE: in-module this reads `argv[0]`,
  not `process.argv[2]` — the bin's `process.argv[2]` is `argv[0]` after `slice(2)`).
- `isRegularFile(p)` = `try { return statSync(p).isFile() } catch { return false }`.
- `failInvalid(mf, errors, io)` → writes `craft-manifest: INVALID manifest <mf>:` then each `- <err>`
  then the `Fix the manifest …` line to `io.stderr`; returns `EXIT_INVALID` (caller returns it).
- `buildFileExists(manifestAbsPath)` → `ROOT = dirname(dirname(manifestAbsPath))`;
  `(p) => isRegularFile(join(ROOT, p)) || isRegularFile(p)`.
- `MF = resolveManifestPath(argv)`. `!isRegularFile(MF)` → stdout `craft-manifest: no manifest at <MF>
  — pure defaults via capability probing.` return 0.
- `extractFrontmatter(readFileSync(MF))`; `fm === null` → stdout `craft-manifest: <MF> has no YAML
  frontmatter — pure defaults.` return 0.
- `load(fm) ?? null` try/catch → `failInvalid(MF, ['malformed YAML frontmatter: <msg>'], io)`.
- `fileExists = buildFileExists(resolve(MF))`; `{ ok, errors } = validateManifest(parsed, { fileExists })`;
  ok → stdout `craft-manifest: <MF> valid.` return 0; else `failInvalid(MF, errors, io)`.

Imports: `readFileSync, statSync` from `node:fs`; `path` (or named `dirname, join, resolve`) from
`node:path`; `load` from `js-yaml`; `validateManifest` — the bin imports it from `../src/index.js` (the barrel);
from `engine/src` that is `./index.js`, but prefer the direct `./manifest.js` (verified:
`engine/src/manifest.js` line 352 `export function validateManifest`) to avoid a barrel round-trip
within `src/`; `extractFrontmatter` from `./frontmatter.js`. Note the bin parses frontmatter via
`extractFrontmatter` + `load(fm)` directly (NOT `parseManifestContent`) — preserve that exact path.

**File to shrink — `engine/bin/manifest-lint.js`** → thin guard importing `../src/manifest-lint-main.js`.

**New test file — `engine/test/manifest-lint-main.test.js`** (in-process units). Import `main`;
capturing `io`. There is no prior bin test, so author fresh units covering each branch; reuse
`engine/test/fixtures/manifests/` fixtures (absolute paths via `fileURLToPath`/`join`) and `mkdtemp`
for the missing/valid cases (write throwaway manifest files under `os.tmpdir()`, `after()`-cleanup —
mirror the `mkdtempSync`/`rmSync` helper in `engine/test/normalize-findings-bin.test.js` lines 1-20).
Cover: absent path (a `/no/such/workflow.md`) → return 0 + stdout `no manifest at`; a fenced
`with-body.md` valid manifest → behaviour per `validateManifest` (it has `profile: lean` frontmatter —
expect 0 + `valid.`); a temp file with a body but no `---` fence (frontmatter null) → 0 + `no YAML
frontmatter`; a temp file with malformed YAML frontmatter (e.g. `---\n: : :\n---`) → 2 + `malformed YAML
frontmatter`; a temp file whose frontmatter fails `validateManifest` (e.g. an unknown top key
`bogus: 1` — confirm against `engine/src/manifest.js` TOP_KEYS that this yields `ok:false`) → 2 +
`INVALID manifest` + the `Fix the manifest` line; `isRegularFile` on a directory path → treated as
absent (return 0). Add a `buildFileExists` ROOT unit by giving a manifest whose frontmatter references
a relative file that exists two dirs up vs not (drive through a fixture if one already exercises
`fileExists`; otherwise a temp dir tree).

**New smoke test — `engine/test/manifest-lint.bin.test.js`** (thin child-process, per ADR-067): one or
two `spawnSync(process.execPath, [bin, <fixture>])` assertions of the real exit code + stdout (e.g.
absent-path → 0; a known-invalid manifest → 2) — mirrors the `spawnSync` helper in
`engine/test/contracts-lint.test.js`. Keep it minimal (exit code + argv wiring only), not the logic
branches.

### TDD steps

- RED: add `engine/test/manifest-lint-main.test.js` importing `main` from the missing
  `../src/manifest-lint-main.js` → `ERR_MODULE_NOT_FOUND`; add `engine/test/manifest-lint.bin.test.js`
  pointing at the (still run-on-import) bin — confirm the smoke expectations.
- RED: with the module present, branch assertions fail until logic is moved.
- GREEN: create `engine/src/manifest-lint-main.js`; shrink `engine/bin/manifest-lint.js` to the guard.
  Units + smoke green.
- REFACTOR: small named helpers (`resolveManifestPath`, `isRegularFile`, `buildFileExists`,
  `failInvalid` all `io`-threaded), early returns, no `process.*` in src. Re-run gate.
- BUMP: reconcile `EXPECTED_TESTS` to the new `# tests` count.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`refactor(engine): extract manifest-lint glue to src for mutation coverage`

## Part 4 — normalize-findings: extract glue to src/normalize-findings-main.js

### Context

**Mutation-scored** target (`engine/src/**/*.js`). New module auto-covered. Lean conversion — the glue
is small but carries the `argv[2] || null` empty-string nuance and the fd-0-vs-file read branch.

**File to create — `engine/src/normalize-findings-main.js`** exporting `export function main(argv, io)`
→ exit code. Move the top-level logic out of `engine/bin/normalize-findings.js` (read it whole,
29 lines). `process.* → io/return`. Preserve byte-identical behaviour:

- `filePath = argv[0] || null` — the `|| null` (NOT `?? null`) is load-bearing: an empty-string arg
  falls through to stdin (preserve the existing comment's intent without provenance refs).
- `fail(message, io)` → `io.stderr.write('normalize-findings: <message>\n')`; returns 2 (caller returns it).
- read: `filePath ? readFileSync(filePath, 'utf8') : readFileSync(0, 'utf8')` in try/catch →
  `fail(err.message, io)` exit 2.
- `normalizeFindings(raw)` in try/catch → `fail(err.message, io)` exit 2.
- success: `io.stdout.write(JSON.stringify(findings, null, 2) + '\n')`, return 0.

Note the stdin path (`readFileSync(0)`) cannot be driven by an in-process unit without a real fd 0;
the in-process units cover the **file-path** + **error** + **success-shape** branches, and the
retained child-process smoke covers the stdin path (which it already does). State this split in the
test file's top comment (behaviour, not provenance).

Imports: `readFileSync` from `node:fs`; `normalizeFindings` from `./findings.js`.

**File to shrink — `engine/bin/normalize-findings.js`** → thin guard importing
`../src/normalize-findings-main.js`.

**New test file — `engine/test/normalize-findings-main.test.js`** (in-process units). Import `main`;
capturing `io`; write a temp findings file via `mkdtempSync` (mirror the helper in
`engine/test/normalize-findings-bin.test.js` lines 1-20, `after()`-cleanup). Cover: file-path mode
with `JSON_INPUT` → return 0 + `io.stdout` equals the canonical bytes (`JSON.stringify([{file:'a.js',
line:3,severity:'HIGH',finding:'x',fix:'y'}], null, 2) + '\n'`); file-path with a per-line file →
identical canonical bytes; a file of structurally-unrecoverable garbage → return 2 + stderr
`normalize-findings:` + empty stdout; JSON-path garbage (`[not valid json`) → return 2; a nonexistent
file path → return 2 + clean `normalize-findings:` message; an empty-string `argv[0]` → must take the
stdin branch (assert it does NOT try to read a file named `''` — drive via the child-process smoke if
the in-process fd-0 read is impractical, and assert the empty-string→stdin routing at the `filePath`
computation level). Reuse the `JSON_INPUT`/`LINE_INPUT`/`EXPECTED` constants pattern from the existing
bin test.

**Retain as smoke** — `engine/test/normalize-findings-bin.test.js` UNCHANGED (covers stdin, file, and
exit-code end-to-end through the real entrypoint).

### TDD steps

- RED: add `engine/test/normalize-findings-main.test.js` importing `main` from the missing
  `../src/normalize-findings-main.js` → `ERR_MODULE_NOT_FOUND`.
- RED: with the module present, file-path/error/success assertions fail until logic is moved.
- GREEN: create `engine/src/normalize-findings-main.js`; shrink the bin to the guard. Units + smoke green.
- REFACTOR: `fail` helper `io`-threaded, early returns, the `|| null` nuance preserved, no `process.*`
  in src. Re-run gate.
- BUMP: reconcile `EXPECTED_TESTS` to the new `# tests` count.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`refactor(engine): extract normalize-findings glue to src for mutation coverage`

## Part 5 — model-class deterministic R10 shape-stability guard

### Context

**Standalone test-infra part — NO `src/` delta.** A property/characterization suite over the already
-exported `assembleContract` (`engine/src/contract.js`) and `normalizeFindings`
(`engine/src/findings.js`). It does NOT fold into a feature part because it touches no implementation;
it discharges R10 (ADR-068's deterministic, CI-gated half). It DOES add `node --test` tests → bump
`EXPECTED_TESTS`.

**What the guard asserts (format-independent signals only — never raw prose layout):**

1. **Contract block is model-independent.** `assembleContract(descriptor, manifest, fragments, opts)`
   (signature read: `opts = { execution?: 'agent'|'inline' }`) takes **no model parameter** — the
   assembled block is a pure function of descriptor + manifest + fragments + execution mode, carrying
   no model-pin text. Assert this structurally: for the documented pins
   (opus=`claude-opus-4-8`, sonnet=`claude-sonnet-4-6`, haiku=`claude-haiku-4-5-20251001`), assembling
   the SAME descriptor/fragments yields the SAME block byte-for-byte (there is no axis along which a
   model pin could perturb it), AND the assembled block contains NONE of the three pin strings (a
   contract fragment that leaked a model id would fail this). Loop a representative descriptor set
   (reuse `parsePipeline(readFileSync(pipeline/default.yml))` as `engine/test/contract-equivalence.test.js`
   lines 28-30 does, and the `FRAGMENTS` map built via `readFragment` from `contracts/`, lines 18-26).
   Pin the three model ids as a `const MODEL_PINS = ['claude-opus-4-8','claude-sonnet-4-6',
   'claude-haiku-4-5-20251001']` (named constants, no magic strings).

2. **`normalizeFindings` is shape-stable across the output shapes the class produces.** The R10 caveat
   is that Haiku emits findings as JSON, opus/sonnet as one-per-line. Assert: for a concrete finding,
   the JSON-array shape and the per-line shape normalize to the **same canonical `Finding[]`** —
   `assert.deepEqual(normalizeFindings(JSON_SHAPE), normalizeFindings(LINE_SHAPE))`. Reuse the exact
   shape-equivalence lens proven in `engine/test/normalize-findings-bin.test.js` lines 26-34
   (`JSON_INPUT = JSON.stringify([{file:'a.js',line:3,severity:'HIGH',finding:'x',fix:'y'}])`,
   `LINE_INPUT = 'HIGH a.js:3 — x | y'`) but call `normalizeFindings` **directly** (in-process, no
   spawn) and `deepEqual` the returned arrays — plus the fix-absent pair (`JSON_NOFIX`/`LINE_NOFIX`)
   to confirm the optional `fix` key is identically absent in both shapes. This is the R10 discharge:
   the engine keys on fields, never on layout, so a model's output-shape choice cannot change the
   canonical findings.

**File to create — `engine/test/model-class-shape.test.js`.** Imports: `assembleContract` from
`../src/contract.js`, `normalizeFindings` from `../src/findings.js`, `parsePipeline` from
`../src/descriptor.js`, `readFileSync`/`fileURLToPath`/`join`/`dirname` for fixtures. Build `FRAGMENTS`
via the `readFragment` pattern (lines 18-26 of `contract-equivalence.test.js`). Titles in Given/When/
Then form, AAA body, `sut` variable. No provenance refs (the R10/SP5/ADR origin lives in the design
doc, not the test).

No new fixtures required — `contracts/`, `pipeline/default.yml`, and the inline finding constants
suffice. (Design's "fixtures to extend" note is conditional — add a `contracts/` assembly fixture only
if a pin needs an assembly the real fragments don't cover; they do, so none is added.)

### TDD steps

- RED: add `engine/test/model-class-shape.test.js`. Before the assertions are correct, write the
  model-independence test to FAIL deliberately by asserting a wrong invariant (e.g. that the block
  *contains* a pin string) to confirm the test is wired and runs, then flip to the real assertion
  (block byte-identical across pins + contains none of the pins). Expected initial failure reason: the
  assembled block does not contain `claude-opus-4-8` (proving model-independence is real).
- RED: `normalizeFindings` shape-stability — assert `deepEqual` of JSON vs per-line canonical arrays;
  confirm it passes for the present `findings.js` (this is a characterization lock, so it goes green
  immediately once the assertion is correct — keep it as the regression guard).
- GREEN: finalize both assertions; whole suite green. No `src/` change.
- REFACTOR: extract `MODEL_PINS`, `FRAGMENTS`, the finding constants as named consts; small helpers;
  re-run gate.
- BUMP: reconcile `EXPECTED_TESTS` to the new `# tests` count.

### Gate

`cd engine && node --test 'test/**/*.test.js'`

### Commit

`test(engine): deterministic model-class shape-stability guard (R10)`

## Part 6 — live model-class matrix procedure + artifact template (docs-only)

### Context

**Docs-only standalone part — NO `src/` delta, NO test, NO `EXPECTED_TESTS` bump.** Authors the
documented, NOT-CI-gated live cross-tier procedure (ADR-068's live half) plus a committed matrix
artifact template that is the single durable home for the harness-surfaced per-phase tokens +
wall-clock numbers (ADR-065 — these are READ from the harness usage block by the orchestrator and
RECORDED; there is NO engine telemetry to add).

**Precedent to follow exactly — `skills/run/SKILL.md`.** Read the existing
`## Manual acceptance check (inline fidelity) — not CI-gated` section (lines 262-269): it is an
on-demand procedure whose result lands in the run record, never blocks a push, and points to its
rationale design doc. Add a **sibling section** immediately after it (before `## Review cadence — engine
vs working-style` at line 271): `## Model-class matrix (cross-tier) — not CI-gated`. The new section
must state:

- **When:** on demand / when a maintainer wants the full-pipeline + output-quality matrix (PRD §12),
  not every run, never a CI gate.
- **What:** run the full pipeline across the Claude class — opus (`claude-opus-4-8`), sonnet
  (`claude-sonnet-4-6`), haiku (`claude-haiku-4-5-20251001`) — recording a tier×dimension
  PASS/PARTIAL/FAIL table.
- **Numbers:** the orchestrator reads per-phase `subagent_tokens` + `duration_ms` from the harness
  usage block the spawn already returns (zero-cost, no subagent self-report, no engine telemetry) and
  records them into the artifact and the run record. State explicitly: no agent is asked to report its
  own usage.
- **Where the result lands:** the committed artifact template below + a one-line entry in the run record.
- **Rationale pointer:** `docs/DESIGN-P13-nfr-hardening.md` (mirroring how the inline-fidelity section
  points to `docs/DESIGN-P6-execution-topology.md`).

**Artifact template location decision (settled here):** create
**`docs/model-class-matrix.md`** as the committed template (a sibling of the `docs/DESIGN-*`/`PLAN-*`
docs — the repo has no dedicated artifacts dir, and `docs/` is where committed, diffable, prose-plus-
table records already live). The template carries: a header naming the three pins; a tier×dimension
PASS/PARTIAL/FAIL table (dimensions = the SP5 contract-adherence axes: planner / part-TDD /
structured-review / blocker, plus a full-pipeline-completion row); and a per-phase
tokens/wall-clock table (columns: phase, tier, `subagent_tokens`, `duration_ms`). Fill it with a
`— (not yet run)` placeholder row per cell so the template is committable and diffable; a maintainer
overwrites cells on a real run. The SKILL.md section points to `docs/model-class-matrix.md` as the
artifact home.

No source/test/`ci.sh` changes — this part edits only `skills/run/SKILL.md` and creates
`docs/model-class-matrix.md`.

### TDD steps

- No automated test (docs-only, per the template's docs/prose exception). Verification is editorial:
  (1) the new SKILL.md section is a sibling of the inline-fidelity section, names all three pins,
  states harness-sourced/no-self-report/no-engine-telemetry, points to the artifact + design doc;
  (2) `docs/model-class-matrix.md` exists with the two tables and placeholder cells; (3) no
  provenance refs (ADR/phase numbers) leak into either file's prose beyond the design-doc rationale
  pointer that the precedent already uses for design docs.
- Sanity: `bash scripts/plan-lint.sh` is irrelevant here; confirm `git diff --no-ext-diff --stat`
  touches only `skills/run/SKILL.md` and `docs/model-class-matrix.md`.

### Gate

`cd engine && node --test 'test/**/*.test.js'`
<!-- Docs-only: the node suite must stay green (it is — no src/test delta); no EXPECTED_TESTS bump,
     no new ci.sh invocation. -->

### Commit

`docs(craft): live model-class matrix procedure + artifact template`
