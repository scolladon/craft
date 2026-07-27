# Design — close hygiene-lint follow-up set

> Brief: land Parts 1–4 (shared hygiene-lint core extraction, hardening, ci.sh
> gate wiring, propose PR-body prose-lint) in one change; advisory stays the
> default posture, and flipping to blocking becomes a one-line manifest edit.
> Status: draft → self-reviewed ×2 → accepted

## Context

The advisory hygiene gates shipped in the prior change (commit `560122a`): two
near-identical CLI lints — `stub-lint` (greps a fixed marker set over touched
source) and `prose-lint` (greps a curated filler-phrase ban list over touched
docs and, at propose, the PR body). Each is a `bin` + `-main.js` pair:

- `engine/bin/{stub,prose}-lint.js` — thin argv shims → `main(argv, io)`.
- `engine/src/{stub,prose}-lint-main.js` — the logic.

The two `-main` modules duplicate, char-for-char, four functions:
`parseArgs`, `collectWaived`, `isSelf`, and the `main` orchestration (plus the
`EXIT_OK`/`EXIT_FOUND` constants and the `scanFile` shell). They differ only in
their constant list (`MARKERS` vs `BAN_LIST`), their per-file scan
(`findMarkers` line-numbered vs `findEntries` whole-content), their FOUND token
(`STUB-FOUND` vs `SLOP-FOUND`), and their waiver regex (`STUB-WAIVE` vs
`SLOP-WAIVE`).

`scripts/ci.sh` wires both gates advisorily over the touched diff via
`compute_touched` / `run_stub_lint` / `run_prose_lint`. The posture is governed
by a `hygiene.gate: advisory|blocking` manifest knob, already validated in
`engine/src/manifest.js` (`validateHygiene`) + `engine/src/manifest-vocabulary.js`
(`HYGIENE_GATES`). Waivers are per-file `STUB-WAIVE(<file>)` / `SLOP-WAIVE(<file>)`
tokens collected from `--waiver-source` files.

Today the blocking mechanism is only half-wired: the knob validates, but `ci.sh`
never reads it and never passes `--gate`, so the gates are hard-advisory. The
propose phase (`skills/propose/SKILL.md`) does not yet run prose-lint over the
drafted PR body, even though the bin already accepts a PR-body file as a plain
argv file (proven by `engine/test/prose-lint-main.test.js`). And several latent
robustness gaps exist in the shared boilerplate (option injection, waiver-path
mismatches, silently-swallowed waiver-source read errors, dangling flags,
unbounded reads, an unescaped user-curated ban list).

## Requirements

1. A single `engine/src/hygiene-lint-core.js` owns the identical
   `parseArgs` / `collectWaived` (parameterized by waiver regex) / `isSelf`
   (parameterized by self path) / `main` orchestration + `scanFile` shell
   (parameterized by per-module scan + FOUND token). Both `-main` modules become
   thin adapters: constant list + scan function + core wiring. Existing tests
   stay green; the core carries focused unit tests.
2. `parseArgs` treats a lone `--` as end-of-options; a trailing `--gate` /
   `--waiver-source` with no value is ignored (not a silent degrade).
3. Both the scanned path and each waiver-capture path are normalized via
   `resolve(process.cwd(), …)` before the Set membership test, so `./x`,
   absolute, and trailing-slash variants of the same file match.
4. A requested-but-unreadable `--waiver-source` gates non-zero under
   `--gate blocking` (today it prints to stderr but never gates — over-blocking).
   Advisory posture is unchanged (still exit 0).
5. A file whose size exceeds a fixed byte cap is skipped with a loud stderr note
   (neutral: neither a finding nor a read error), never a crash.
6. prose-lint escapes each single-token ban-list entry before `new RegExp`, and
   lowercases file content once per file (not once per multi-word entry).
7. `ci.sh` computes the touched set once and feeds both gates; the redundant
   `core.quotepath=false` (redundant under `-z`) is dropped; it reads the
   resolved `hygiene.gate` and passes `--gate` (and `--`) through to both bins;
   the prose gate's touched-doc set excludes `docs/adr/**`, `docs/design/**`,
   `docs/archive/**`.
8. The propose phase scans the drafted PR body with prose-lint advisorily,
   honoring the same `hygiene.gate` knob and `SLOP-WAIVE(<file>)` waiver, folding
   `SLOP-FOUND` lines into the run record / PR body.
9. craft's own `.claude/workflow.md` stays advisory (no `hygiene` block), so
   today's behavior is unchanged and the flip to blocking is henceforth a
   one-line manifest edit, never code.

## Design

### Shared core (`engine/src/hygiene-lint-core.js`)

Exports, all pure and independently testable:

- `EXIT_OK = 0`, `EXIT_FOUND = 2`, `MAX_FILE_BYTES` (fixed cap).
- `escapeRegExp(literal)` — escapes regex metacharacters in a single token.
- `parseArgs(argv) → { gate, waiverSources, files }` — `--`/dangling-flag aware
  (Req 2). Default `gate` stays a non-`'blocking'` sentinel (`'advisory'`).
- `collectWaived(waiverSources, io, waiverPattern) → { waived: Set<string>, readError: boolean }`
  — resolves each capture to an absolute path (Req 3); flags a read error rather
  than swallowing it (Req 4).
- `isSelf(filePath, self) → boolean`.
- `scanFile(file, waived, io, { self, foundToken, scan }) → { found, readError }`
  — self/waiver guard on the resolved path (Req 3); `statSync` size guard before
  `readFileSync` (Req 5); read-error handling; prints `${foundToken}(${file}): …`
  for each finding `scan(content)` returns.
- `main(argv, io, { self, waiverPattern, foundToken, scan }) → exitCode` —
  parse → collect → per-file scan → `gate === 'blocking' && (findings || readErrors)
  ? EXIT_FOUND : EXIT_OK`. The `readErrors` term now includes the waiver-source
  read error (Req 4).

Adapters (`engine/src/{stub,prose}-lint-main.js`) shrink to: the constant list,
the per-module `scan(content) → string[]`, the module's `SELF`/`waiverPattern`/
`foundToken`, and a one-line `export function main(argv, io)` delegating to the
core. prose's `scan` lowercases once (Req 6) and builds single-token regexes via
`escapeRegExp` (Req 6). All shared hardening (Reqs 2–5) lives once in the core.

### Byte-cap semantics

`scanFile` calls `statSync(file)` first. A `statSync` throw is a read error
(same as today's `readFileSync` throw). `stat.size > MAX_FILE_BYTES` → a loud
`skipping <file>: <n> bytes exceeds <cap> limit` note on stderr and a neutral
`{ found: false, readError: false }` — a skip is not an over-block.

### ci.sh + gate mechanism

- `compute_touched` runs once; its output is captured to a bash array/temp and
  fed to both `run_stub_lint` and `run_prose_lint`. `-c core.quotepath=false` is
  dropped (redundant under `-z`, which already emits raw bytes).
- A tiny resolver bin `engine/bin/hygiene-gate.js <manifest-path>` prints the
  resolved gate: absent/empty manifest or missing `hygiene.gate` → `advisory`;
  otherwise the validated `hygiene.gate` value. It reuses `parseManifestContent`
  (`engine/src/frontmatter.js`) + `HYGIENE_GATES`. `ci.sh` reads it once
  (`.claude/workflow.md`, default `advisory` on any failure) and passes
  `--gate "$gate"` plus a `--` sentinel before the file list to both bins.
- `run_prose_lint` classifies a touched `*.md` as a scan target only when it is
  NOT under `docs/adr/`, `docs/design/`, `docs/archive/` (those necessarily quote
  ban-list words; scanning them is advisory noise). Excluded docs are still
  usable as waiver sources? No — they are dropped from the doc set entirely, so
  neither scanned nor consulted for waivers (they carry no waiver tokens).

### propose PR-body wiring

After the PR body is drafted and before `pr create`, the propose phase writes the
body to a temp file, resolves the gate the same way (`hygiene-gate.js` over the
manifest, default advisory), and runs
`prose-lint.js --gate <gate> [--waiver-source <body-file>] -- <body-file>`.
`SLOP-FOUND` lines fold into the run record and the PR body's hygiene note. The
`SLOP-WAIVE(<file>)` waiver is honored because the body file is passed as its own
`--waiver-source`. This is PR-body only — not the `ci.sh` touched-docs cadence.

## Decision candidates

All load-bearing choices are pre-resolved by the brief (no open user decision):

- **Shared-core extraction proceeds** (Part 1) — resolved: yes.
- **Provenance-doc exclusion** (Part 3) — resolved: exclude `docs/adr` +
  `docs/design` + `docs/archive`.
- **Advisory stays the default posture** by config — resolved: yes; Part 3 makes
  the flip config-only (`hygiene.gate: blocking` one-liner).
- **Gate-resolution mechanism** — a dedicated `hygiene-gate.js` resolver bin (vs
  ad-hoc grep in ci.sh) — resolved by the engine's bin+src convention: a resolver
  bin, so ci.sh reads a *validated resolved* value, not a raw grep.

⇒ Decision-candidates set is empty of open choices; the decisions phase
auto-skips.

## Test strategy

TDD, London-school, Given/When/Then. Per part:

- **Core**: focused unit tests for `parseArgs` (`--` end-of-options, dangling
  `--gate`/`--waiver-source`), `collectWaived` (path normalization variants,
  read-error flag), `isSelf`, `escapeRegExp`, and `scanFile` (byte-cap skip note,
  read error). Existing `{stub,prose}-lint-main.test.js` + `.bin.test.js` stay
  green unchanged (behavior-preserving extraction).
- **Hardening**: option-injection (`-- --gate` treated as a file); waiver-path
  normalization (`./x` vs absolute vs trailing slash all match); unreadable
  waiver-source gates under blocking, stays 0 advisory; large-file skip note;
  prose metacharacter ban-list entry does not build a broken/over-matching
  pattern; prose lowercase-once preserves multi-word substring + single-token
  word-boundary semantics.
- **hygiene-gate.js**: absent manifest → `advisory`; `hygiene.gate: blocking` →
  `blocking`; malformed/unknown gate → non-zero (validated).
- **ci.sh**: extend `test/hygiene-gates-ci.test.js` — single `compute_touched`
  feed, no `core.quotepath=false`, `--gate`/`--` passed to both bins, provenance
  dir exclusion in `run_prose_lint`.
- **propose**: `skills/propose/SKILL.md` invokes prose-lint over the body file
  with `--gate` + `--` + `--waiver-source <body>` (structure assertion, mirroring
  the run-token doc test).
- **Coverage**: ≥80%; validation phase runs Stryker mutation per-hunk and triages
  survivors.

## Out of scope

- Flipping craft's own posture to blocking (kept advisory by config; the flip is
  a one-line manifest edit, deliberately left to config).
- Any new hygiene-lint follow-up entries — this change closes the set.
- Extending prose-lint's ban list or stub-lint's marker set.
- A shared bin shim for the two `bin/*.js` files (already 5 lines each; not worth
  a third module).
