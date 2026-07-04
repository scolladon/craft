# Plan — close hygiene-lint follow-up set

> Source: design doc `docs/design/close-hygiene-lint-followups.md` · ADRs none
> The plan is the implementation script AND the knowledge handoff. Parts are
> dependency-ordered (2 needs 1's core; 3's ci.sh passes `--` honored by 1+2;
> 4 needs 3's gate resolver) and each lands as one atomic, independently
> revertable conventional commit.

## Sizing rules

Four parts, each mixing src + its own tests (no standalone test-only feature
parts). Part 4 is a docs/prose part (SKILL.md + a structure test).

## Part 1 — Extract `hygiene-lint-core.js`, thin adapters

### Context
Current files (worktree paths):
- `engine/src/stub-lint-main.js` (137 lines) and `engine/src/prose-lint-main.js`
  (152 lines) each define, char-for-char-identical except the noted constants:
  `EXIT_OK=0`, `EXIT_FOUND=2`; `parseArgs(argv)→{gate,waiverSources,files}` (loop
  over `--gate`/`--waiver-source`/positional; `gate` default `'advisory'`);
  `collectWaived(waiverSources, io)` (reads each source, `matchAll(WAIVER_PATTERN)`,
  `waived.add(match[1].trim())`, unreadable → stderr `cannot read waiver source …`
  + continue); `isSelf(filePath)` (`resolve(process.cwd(), filePath) === SELF`);
  `scanFile(file, waived, io)` (self/waived guard → `{found:false,readError:false}`;
  `readFileSync` try/catch → stderr `cannot read <file>: …` + `{found:false,readError:true}`;
  per-finding `io.stdout.write(\`<TOKEN>(<file>): <finding>\n\`)`); `main(argv, io)`
  (parse → collect → per-file scan → `gate==='blocking' && (hasFindings||hasReadErrors)
  ? EXIT_FOUND : EXIT_OK`).
- Per-module differences: stub `MARKERS=Object.freeze(['TODO','FIXME','HACK','XXX',
  'PLACEHOLDER','STUB'])`, `WAIVER_PATTERN=/STUB-WAIVE\(([^)]+)\)/g`, token `STUB-FOUND`,
  `findMarkers(content)` splits lines, per line `matchAll(/\b(MARKERS|)\b/gi)` →
  `\`${match[1].toUpperCase()}@L${idx+1}\``. prose `BAN_LIST=Object.freeze(['delve',
  'leverage','seamless','robust',"it's important to note",'in conclusion'])`,
  `WAIVER_PATTERN=/SLOP-WAIVE\(([^)]+)\)/g`, token `SLOP-FOUND`, `findEntries(content)`
  = `BAN_LIST.filter(entryMatches)`; `entryMatches` multi-word → substring, single →
  `new RegExp(\`\\b${entry}\\b\`,'i').test`.
- The two `bin/*.js` (`engine/bin/{stub,prose}-lint.js`) are unchanged 5-line shims
  importing `main` from their `-main.js`.
- Tests that MUST stay green unchanged: `engine/test/{stub,prose}-lint-main.test.js`
  (import `main` from the `-main.js`), `engine/test/{stub,prose}-lint.bin.test.js`
  (spawn the bin). The `-main.js` files keep exporting `main(argv, io)`.
- Equivalent-mutant comments in the current source (StringLiteral default, ObjectLiteral
  return, BooleanLiteral found:true) move with the code they annotate into the core.

New file `engine/src/hygiene-lint-core.js` exports: `EXIT_OK`, `EXIT_FOUND`,
`parseArgs(argv)`, `collectWaived(waiverSources, io, waiverPattern)` (regex param),
`isSelf(filePath, self)` (self param), `scanFile(file, waived, io, ctx)` and
`main(argv, io, ctx)` where `ctx = { self, waiverPattern, foundToken, scan }` and
`scan(content) → string[]`. This part is behavior-preserving; hardening (Part 2)
lands next in the single core.

### TDD steps
- RED: new `engine/test/hygiene-lint-core.test.js` — `parseArgs` parses gate/sources/
  files; `collectWaived` returns a Set of trimmed captures for a given regex + flags an
  unreadable source; `isSelf` true only for the self path; `scanFile` prints
  `<foundToken>(<file>): <finding>` and returns `{found,readError}`; `main` returns
  EXIT_FOUND only under blocking with findings. Fails: module absent.
- GREEN: create `hygiene-lint-core.js` by lifting the shared functions (parameterized).
- REFACTOR: rewrite `{stub,prose}-lint-main.js` as thin adapters delegating to the core;
  keep their doc-comment headers, constant lists, `scan` functions, `SELF`,
  `waiverPattern`, `foundToken`, and `export function main(argv, io)`.
- Confirm existing `{stub,prose}-lint-main.test.js` + `.bin.test.js` stay green.

### Gate
`node --test engine/test/hygiene-lint-core.test.js engine/test/stub-lint-main.test.js engine/test/prose-lint-main.test.js engine/test/stub-lint.bin.test.js engine/test/prose-lint.bin.test.js`

### Commit
`refactor: extract shared hygiene-lint-core from stub/prose lint modules`

## Part 2 — Harden the shared core + module bits

### Context
All in `engine/src/hygiene-lint-core.js` (from Part 1) unless noted:
- `parseArgs`: add a lone `--` → end-of-options (subsequent tokens are files even if
  `--`-prefixed); a `--gate`/`--waiver-source` with no following value (index past end)
  is ignored, not consumed as `undefined`.
- `collectWaived`: `resolve(process.cwd(), match[1].trim())` each capture before
  `waived.add`; return `{ waived, readError }` (was bare Set) — set `readError=true` on
  an unreadable source. `main` must OR this into `hasReadErrors`.
- `scanFile`: membership test on `resolve(process.cwd(), file)` (not raw `file`);
  `statSync(file)` before read — throw → read error; `stat.size > MAX_FILE_BYTES`
  (add `export const MAX_FILE_BYTES`, e.g. 5_000_000) → stderr
  `skipping <file>: <size> bytes exceeds <cap> limit` + neutral `{found:false,readError:false}`.
- `escapeRegExp(s)` new export: `s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
- prose adapter `engine/src/prose-lint-main.js`: `scan(content)` computes
  `const lower = content.toLowerCase()` ONCE; multi-word entry → `lower.includes(entry.toLowerCase())`;
  single-token → `new RegExp(\`\\b${escapeRegExp(entry)}\\b\`,'i').test(content)`.
  (Behavior for current BAN_LIST unchanged; guards a future metacharacter entry.)
- Advisory-vs-blocking semantics otherwise unchanged: advisory still returns 0.

### TDD steps
- RED (core test): `-- --gate x.js` → `--gate` treated as a file, not an option;
  trailing `--gate` with no value → ignored (gate stays default); waiver-path variants
  (`./rel`, absolute, trailing slash) of the same file all clear a blocking finding;
  unreadable `--waiver-source` under blocking → EXIT_FOUND, advisory → 0; a > cap file →
  stderr skip note + not a finding + not a read error.
- RED (prose test): a ban-list containing a metacharacter token (inject via a tiny
  seam or a dedicated `escapeRegExp` unit test) does not throw / over-match; `escapeRegExp`
  escapes metacharacters; lowercase-once preserves the existing substring + word-boundary
  cases (existing tests already pin these — keep green).
- GREEN: implement the guards in the core + prose adapter.
- REFACTOR: tidy; ensure equivalent-mutant notes stay accurate.

### Gate
`node --test engine/test/hygiene-lint-core.test.js engine/test/stub-lint-main.test.js engine/test/prose-lint-main.test.js`

### Commit
`feat: harden hygiene-lint core (--, path-normalize, gate read-errors, size cap, regex-escape)`

## Part 3 — ci.sh dedupe + gate resolver + provenance exclusion

### Context
- `scripts/ci.sh` hygiene block (bottom): `compute_touched()` runs `git -c core.quotepath=false
  diff --no-ext-diff -z --name-only "$base"..HEAD` piped through a NUL-read that emits
  existing non-symlink paths. `run_stub_lint` and `run_prose_lint` each call
  `compute_touched` (twice today). Drop `-c core.quotepath=false` (redundant under `-z`).
  Capture `compute_touched` once into a variable/array and feed both gates.
- New resolver bin `engine/bin/hygiene-gate.js` + `engine/src/hygiene-gate-main.js`
  (bin+src convention like manifest-lint): `main(argv, io)` reads the manifest path arg;
  missing file / no frontmatter / no `hygiene.gate` → prints `advisory`; else parses via
  `parseManifestContent` (`engine/src/frontmatter.js`) and validates the value against
  `HYGIENE_GATES` (`engine/src/manifest-vocabulary.js`) — unknown value → stderr + non-zero.
  ci.sh: `gate="$(node engine/bin/hygiene-gate.js .claude/workflow.md 2>/dev/null || echo advisory)"`.
- Both gates invoke: `node engine/bin/<x>-lint.js --gate "$gate" <waivers…> -- "<files…>"`
  (the `--` sentinel from Part 2; craft's own manifest has no hygiene block → `advisory`).
- `run_prose_lint`: a touched `*.md` is a scan target only when NOT matching
  `docs/adr/*`, `docs/design/*`, `docs/archive/*` (case in the `while` loop). Those dirs
  necessarily quote ban-list words.
- Test surface `test/hygiene-gates-ci.test.js` currently asserts: both functions defined
  + called on their own line; ordering `run_intention_lint` < `shellcheck scripts` <
  `run_stub_lint`; run/SKILL.md documents the 4 tokens. KEEP these (the call-site lines
  `run_stub_lint` / `run_prose_lint` stay bare; `--gate` is inside the bodies).

### TDD steps
- RED: `engine/test/hygiene-gate-main.test.js` — absent manifest → `advisory`;
  `hygiene.gate: blocking` fixture → `blocking`; unknown gate → non-zero + stderr.
- RED: extend `test/hygiene-gates-ci.test.js` — ci.sh contains no `core.quotepath=false`;
  `compute_touched` invoked once in the hygiene block; both bins receive `--gate` and a
  `--` sentinel; `run_prose_lint` body excludes `docs/adr`/`docs/design`/`docs/archive`.
- GREEN: add the resolver bin+src; edit ci.sh (dedupe, gate read, `--`, exclusion).
- REFACTOR: keep the two hygiene functions independently revertable.

### Gate
`node --test engine/test/hygiene-gate-main.test.js test/hygiene-gates-ci.test.js && shellcheck scripts/ci.sh`

### Commit
`feat: wire ci.sh hygiene gates to resolved manifest knob, dedupe touched, exclude provenance docs`

## Part 4 — Wire prose-lint over the PR body at propose

### Context
- `skills/propose/SKILL.md` drafts/uses a PR body then calls `pr create` (the `propose`
  verb). It does NOT yet run prose-lint over the body. The prose bin accepts a PR-body
  file as a plain argv file (proven by `engine/test/prose-lint-main.test.js` PR-body test).
- Add a step (after the body is drafted, before `pr create`): write the body to a temp
  file; resolve the gate via `node engine/bin/hygiene-gate.js <manifest-path>` (default
  advisory); run `node engine/bin/prose-lint.js --gate <gate> --waiver-source <body-file>
  -- <body-file>`; fold `SLOP-FOUND(<file>): …` lines into the run record and the PR
  body's hygiene note. Honors `hygiene.gate` + `SLOP-WAIVE(<file>)` (body is its own
  waiver source). PR-body only — not the ci.sh touched-docs cadence.
- Test: mirror the existing run-token doc test — a node test reading
  `skills/propose/SKILL.md` asserting it invokes `prose-lint.js` over the body with
  `--gate` + `--` + `--waiver-source`.

### TDD steps
- RED: `engine/test/propose-prose-lint-wiring.test.js` — `skills/propose/SKILL.md`
  references `prose-lint.js`, `--gate`, `--`, `--waiver-source`, and the PR body.
- GREEN: edit `skills/propose/SKILL.md` to add the advisory PR-body prose-lint step.
- REFACTOR: none.

### Gate
`node --test engine/test/propose-prose-lint-wiring.test.js`

### Commit
`feat: scan the drafted PR body with prose-lint at propose (advisory, gate-knobbed)`
