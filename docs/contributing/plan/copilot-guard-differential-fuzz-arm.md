# Plan — copilot-guard-differential-fuzz-arm

> Source: design doc `docs/contributing/design/copilot-guard-differential-fuzz-arm.md` · ADRs `649, 650, 651, 652, 653, 654`
> (649 ratified by the user: DC-1 (a), a strict two-sided census; 650 adopted as recommended: the gate
> blocks `mapfile`/`readarray`/`compgen` in command position; 651: the generator lives in
> `engine/test-helpers/`; 652: the arm installs the run-tree stubs, `withTree` is unchanged;
> 653: the arm judges in-process through `decideGuard`; 654: the docs state the real rules and
> residuals, and both BACKLOG entries are marked delivered in place)
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Plan shape (3 parts)

| # | Part | src delta | Files | Size | Design section |
|---|---|---|---|---|---|
| 1 | Plain-gate generator, stubs and its self-tests | none (test-infra-only) | 2 | M | Design Part 2, Test strategy "Generator self-tests" |
| 2 | The copilot arm's census, then the gate fix it drives | +4 lines in the gate | 3 | M | Design Parts 1 and 3, Test strategy "Order", "Census" |
| 3 | Living docs and the two BACKLOG entries | none (docs-only) | 3 | S | Design Part 4, R8 |

How the design lands here:

- The design's "Order" says: generator, then arm (red), then the gate fix. A red census can never be
  committed (the part gate is `bash scripts/ci.sh`, which runs the arm). So the census and the gate
  fix land in ONE part (Part 2): the census is written first, run red against today's gate (the RED
  evidence goes in the part handback), and the word-list change turns it green before the commit.
  Part 1 lands only the generator and its deterministic self-tests, which are green against today's
  gate. This keeps the design's red-first proof without a red commit.
- The generator self-tests live in the arm file (design Test strategy), so Part 1 creates
  adapters/copilot/test/git-guard.differential.test.js with the generator `describe` only, and Part 2
  adds the census `describe` to the same file.
- The design's "ADR recording DC-1 and DC-2" is already landed (ADR-649..654); no part writes an ADR.
- Not in this plan: the root README design-doc count and ADR count (already bumped with the design and
  ADR commits). This plan commit bumps the parted-plan count 82 → 83 (README.md:200).
- Untouched: `withTree` and the rest of engine/test-helpers/git-differential-harness.js (ADR-652), the
  codex arm, engine/stryker.conf.json (the arm is not in `tap.testFiles`, by omission; the generator is
  not under `mutate`), the predicate arm and its scale-knob red (out of scope).

Pre-validated in a mktemp throwaway copy of this branch (`9912010`), with the exact code below, on
`/bin/bash` 3.2.57 and a bash 5.2.37 built from the GNU tarball inside the throwaway (put first on
PATH so `secondBash()` returns it), `sh` → `/bin/dash`:

| Check | Result |
|---|---|
| Part 1 self-tests (8 tests) vs today's gate | 8 pass |
| Census, default seed 20260 × 400, today's gate, `/bin/bash` 3.2 | **red**: 2 FALSE ALLOW (listed in Part 2 step 1) |
| Census, same, bash 5.2 | **red**: 14 FALSE ALLOW (`mapfile`/`readarray -tc1 -C`, `compgen -C`) |
| Census, default seed, gate fixed, 3 runs, bash 3.2 | green 3/3; invoked 356; wall 0.8-1.7 s |
| Census, default seed, gate fixed, bash 5.2 | green; invoked 390; wall 1.8 s |
| Scale knob `GUARD_FUZZ_SEEDS=1,2,3,4,5 GUARD_FUZZ_COUNT=2000`, gate fixed, both shells | green 10/10 legs; invoked 1769-1956 per leg; wall 36-40 s per leg (10 legs concurrent) |
| engine/test/guards/*.test.js with the Part 2 rows + fix | 917 pass / 0 fail |
| adapters/codex `test/**/*.test.js` with the fix | 712 pass / 0 fail |
| adapters/copilot `test/**/*.test.js` with Parts 1-2 | 627 pass / 0 fail / 1 skipped (no bash ≥ 5 on PATH) |
| Gate verdicts of the Part 2 unit rows, today's gate | all 8 rows `{ block: false }` (so the 5 complex rows are RED, the 3 plain rows GUARD) |

Default-seed false blocks by tag after the fix (diagnostic, not asserted): bash 3.2
`{"evaluator-word":63,"quoted-expansion":52,"unsafe-config":11,"any-word-anchor":5,"control-flow-unreached":6,"unplain-character":14}`,
bash 5.2 `{"evaluator-word":48,"quoted-expansion":57,...same}`.

Standing rules for every part:

- TDD London School; `describe`/`it` titles in Given/When/Then; AAA bodies with a `sut` variable.
  **Titles are printable ASCII only** (` - ` not an em dash, `>=` not `≥`; no `⏎`, NEL, U+2028 or
  invisible characters; never a generated or multi-line command in a title — Stryker's tap dry run
  rejects them). Multi-line commands are built with `\n` in the body.
- No provenance in source or tests: no ADR/phase/part/backlog/design-candidate numbers, no `R4`/`DC-2`
  style ids. test/source-hygiene.test.js scans titles and comments for
  `ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+|DC-\d+`. engine/src, docs/contributing/specs and README.md
  must not contain the words `stryker`, `mutation`, `mutant` (outside the repo's
  `// equivalent mutant (<Mutator>): <why>` annotation), `gh` or `github`.
- No suppression directives, no swallowed errors, no `any`-style escapes.
- Git: use `/usr/bin/git` for every verb (an `rtk` rewrite trips the worktree guard); scripted
  `git diff`/`git show` pass `--no-ext-diff`. Stage explicit paths only (never `commit -am`, never
  `add -A`): another agent may share the tree. Commit with `/usr/bin/git commit -m "<message>"`.
- Run `bash scripts/ci.sh > <scratch>/ci.log 2>&1; echo "exit $?"`, then grep the log for
  `not ok`/`^ci:` lines; never read the whole log. If a bounded-time or fuzz test dies by SIGTERM
  under machine load, re-run it unchanged once before calling it red.
- Committed text carries repo-relative paths only (test/source-hygiene.test.js rejects any
  home-rooted path anywhere in the tracked tree).
- Only `/bin/bash` 3.2 exists on the maintainer box, so `secondBash()` returns `null` and the bash ≥ 5
  census leg is skipped locally; Linux CI runs `/bin/bash` 5. To see the bash-5 leg locally, build
  bash 5 in a `mktemp -d` throwaway (`curl -sSfL https://ftp.gnu.org/gnu/bash/bash-5.2.37.tar.gz`,
  `./configure --without-bash-malloc --disable-nls && make -j8`, ~2 min) and prefix PATH with its
  dir for the targeted run only. Optional; the macOS leg alone carries the required RED.

## Part 1 — Plain-gate generator, stubs and its self-tests

### Context

Files this part creates:

- `engine/test-helpers/plain-gate-generator.js` — CREATE (ESM, ~170 lines). Binding-neutral generator
  of one-judged-fragment commands for the plain-command gate, plus the run-tree stubs.
- `adapters/copilot/test/git-guard.differential.test.js` — CREATE with the generator `describe` only
  (Part 2 adds the census `describe`).

Public-surface decision: **internal**. Every export of the new module is a test helper consumed only
by the copilot arm. engine/test-helpers has no barrel, nothing in engine/src imports it,
engine/stryker.conf.json does not mutate it (`mutate` is `engine/src/**/*.js` plus listed adapter
src), and no doc names it except the design. No surface gate applies. The arm file is picked up by
`run_suite adapters/copilot adapters/copilot/test adapters/copilot` in scripts/ci.sh (every
`*.test.js` under the dir) and is NOT added to engine/stryker.conf.json `tap.testFiles` (copilot
files are listed one by one there; leave it out, like the codex arm). The stub-lint hygiene gate
skips `test-helpers/*` and `*/test/*`, so `STUBS`/`installStubs` names are fine.

Harness primitives to import (read-only, engine/test-helpers/git-differential-harness.js, its
`export { … }` block at the end of the file): `mulberry32(seed)` → `() => number in [0,1)`,
`pick(rng, items)`, `RESIDUAL_MARKER` (`'residual-marker'`; `oracleVerdict` drops any logged argv that
holds it). The harness also exports `TAGS.residual === 'residual'`; the generator's own `residual`
tag uses the same string.

Facts the shapes rely on (pinned in the design's "Pinned E" table, re-measured in pre-validation):

- `compgen -C 'G' x` runs `G '' x` on bash 3.2 and `G compgen x` on bash 5.2 (an argv logged, so
  the oracle sees a destructive `G`). `seq 2 | mapfile -tc1 -C 'G'` and `readarray` run `G 0 1`,
  `G 1 2` on bash ≥ 4 only; bash 3.2 exits 127 (`command not found`, not a syntax error).
- The gate reads any standalone `-c` word, and any word matching `/^(?:--config-env|-c.)/is`
  (case-INSENSITIVE, see `ATTACHED_CONFIG` in engine/src/guards/git-plain-command-gate.js), as a git
  config operand and blocks on it. A standalone `-C` is NOT a config flag (`CONFIG_FLAGS` is a
  case-sensitive Set) — so the coincidence check must not use a case-insensitive `/^-c$/`. The
  `-tc1` cluster is deliberate: it escapes the coincidence and still sets a quantum of 1.
- `until G; do :; done` ends after one call only because the stub git exits 0; a core that exits
  non-zero (`compgen` exits 1) would loop until the 5 s spawn timeout, so `until` wraps the plain
  core only (`PREFIX.loopSafe`).
- `! G`, `coproc G; wait` are not pipeable after a filler (`ls | ! git push` is not portable
  grammar), so `pipeable: false` restricts their before-joiner to `; `, ` && `, newline.
- An odd quote or backtick in a `$(cat <<'EOF' … EOF)` body is a syntax error on bash 3.2 only:
  those two idiom bodies carry `shell-dependent`.
- Anchors: one row per core shape (50 shapes) with `G = git push`, then the 14 prefixes over the
  plain core (6 word + 8 structure incl. `until`): 64 anchor rows, all within `CAP = 400`.

The module, exactly as pre-validated (write it verbatim; the comments state why, not what):

```js
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { RESIDUAL_MARKER, mulberry32, pick } from './git-differential-harness.js';

const EXECUTABLE_MODE = 0o755;
const ANCHOR_INVOCATION = 'git push';
const PREFIX_ODDS = 0.5;
const FILLER_ODDS = 0.5;

const PLAIN_GATE_TAGS = Object.freeze({
  plain: 'plain',
  prefix: 'prefix',
  unplainCharacter: 'unplain-character',
  evaluatorWord: 'evaluator-word',
  argvWrapper: 'argv-wrapper',
  residual: 'residual',
  quotedExpansion: 'quoted-expansion',
  unsafeConfig: 'unsafe-config',
  anyWordAnchor: 'any-word-anchor',
  controlFlowUnreached: 'control-flow-unreached',
  shellDependent: 'shell-dependent',
});
const TAG = PLAIN_GATE_TAGS;
// Each tag names one intended false block the copilot docs state; residual is accepted either way.
const PLAIN_GATE_FALSE_BLOCK_TAGS = Object.freeze([
  TAG.quotedExpansion, TAG.unplainCharacter, TAG.evaluatorWord, TAG.unsafeConfig, TAG.anyWordAnchor, TAG.controlFlowUnreached,
]);
// bash 3.2 rejects an odd quote or backtick inside a heredoc held by $(...); bash 5 accepts it.
const SHELL_DEPENDENT_TAGS = Object.freeze([TAG.shellDependent]);

const GIT_INVOCATIONS = Object.freeze([
  'git push', 'git push origin main', 'git reset --hard', 'git reset --soft', 'git clean -fd', 'git clean -n',
  'git branch -D x', 'git branch -d x', 'git diff', 'git diff --no-ext-diff', 'git show', 'git status', 'git log -1',
]);
const FILLERS = Object.freeze(['ls', 'echo ok', 'true', 'git status', 'git log -1']);
const JOINERS_BEFORE = Object.freeze(['; ', ' && ', ' | ', '\n']);
const JOINERS_AFTER = Object.freeze(['; ', ' && ', '\n']);

// A redirect or assignment goes on the core's last pipeline element; a structure wraps the whole core.
const WORD_PREFIXES = Object.freeze(['> o ', '>>o ', '2>/dev/null ', '2>&1 ', '>|o ', 'A=1 ']);
const UNTIL_PREFIX = core => `until ${core}; do :; done`;
const STRUCTURE_PREFIXES = Object.freeze([
  core => `if ${core}; then :; fi`,
  core => `while ${core}; do break; done`,
  core => `if true; then ${core}; fi`,
  core => `true && ${core}`,
  core => `false || ${core}`,
  core => `echo x | ${core}`,
  core => `${core} | cat`,
]);

const PREFIX = Object.freeze({ none: 'none', simple: 'simple', loopSafe: 'loop-safe' });

const shape = (tags, render, { head = '', prefix = PREFIX.none, pipeable = true } = {}) =>
  Object.freeze({ tags: Object.freeze([...tags]), head, render, prefix, pipeable });

const idiom = body => `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`;

const CORE_SHAPES = Object.freeze([
  shape([TAG.plain], g => g, { prefix: PREFIX.loopSafe }),
  shape([TAG.unplainCharacter], g => `! ${g}`, { pipeable: false }),
  shape([TAG.unplainCharacter], g => `{ ${g}; }`),
  shape([TAG.unplainCharacter], g => `( ${g} )`),
  shape([TAG.unplainCharacter], g => `${g} # c`),
  shape([TAG.unplainCharacter], g => `${g} < /dev/null`),
  shape([TAG.unplainCharacter], g => `case x in x) ${g};; esac`),
  ...['env', 'command', 'nohup', 'nice', 'exec', 'time', 'sudo', 'timeout 5'].map(wrapper =>
    shape([TAG.evaluatorWord], g => `${wrapper} ${g}`, { prefix: PREFIX.simple })),
  shape([TAG.evaluatorWord], g => `trap '${g}' EXIT`, { prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `mapfile -tc1 -C '${g}'`, { head: 'seq 2 | ', prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `readarray -tc1 -C '${g}'`, { head: 'seq 2 | ', prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `compgen -C '${g}' x`, { prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `coproc ${g}; wait`, { pipeable: false }),
  shape([TAG.evaluatorWord], () => 'mapfile -t a', { head: 'git log | ', prefix: PREFIX.simple }),
  ...['stdbuf -o0', 'caffeinate', 'setsid', 'chrt -o 0', 'taskset 1', 'unbuffer', 'doas', 'strace -f', 'flock o', 'xcrun',
    'arch -arm64', 'ssh host'].map(wrapper => shape([TAG.argvWrapper], g => `${wrapper} ${g}`, { prefix: PREFIX.simple })),
  ...['watch -n1 -t', 'tmux new -d', 'ssh host', 'parallel :::'].map(runner =>
    shape([TAG.residual], g => `${runner} '${g} ${RESIDUAL_MARKER}'`, { prefix: PREFIX.simple })),
  shape([TAG.quotedExpansion], () => idiom('msg')),
  shape([TAG.quotedExpansion], g => idiom(`x)"; ${g}; echo "`)),
  shape([TAG.quotedExpansion, TAG.shellDependent], () => idiom('a`b')),
  shape([TAG.quotedExpansion, TAG.shellDependent], () => idiom("don't")),
  shape([TAG.quotedExpansion], () => "git commit -m 'cost $5'"),
  shape([TAG.quotedExpansion], () => 'git commit -m "stop!"'),
  shape([TAG.quotedExpansion], () => 'git commit -m "a\\\\b"'),
  shape([TAG.quotedExpansion], () => "git log --format='%H `x`'"),
  shape([TAG.unsafeConfig], () => 'git -c core.pager=cat log -1'),
  shape([TAG.unsafeConfig], () => 'GIT_PAGER=cat git log -1'),
  shape([TAG.unsafeConfig], () => 'git -c alias.p=push p'),
  shape([TAG.anyWordAnchor], g => `echo ${g}`),
  shape([TAG.controlFlowUnreached], g => `false && ${g}`),
]);

const entry = (text, tags) => Object.freeze({ text, tags: Object.freeze([...new Set(tags)]) });

const prefixesOf = core => {
  if (core.prefix === PREFIX.none) return [];
  const words = WORD_PREFIXES.map(word => text => `${core.head}${word}${text}`);
  const structures = [...STRUCTURE_PREFIXES, ...(core.prefix === PREFIX.loopSafe ? [UNTIL_PREFIX] : [])];
  return [...words, ...structures.map(wrap => text => wrap(`${core.head}${text}`))];
};

const bare = (core, invocation) => `${core.head}${core.render(invocation)}`;

const prefixed = (core, invocation, wrap) => entry(wrap(core.render(invocation)), [...core.tags, TAG.prefix]);

const PLAIN_CORE = CORE_SHAPES[0];
// One row per core shape, then every prefix over the plain core: each class is reached at any cap past the anchors.
const ANCHORS = Object.freeze([
  ...CORE_SHAPES.map(core => entry(bare(core, ANCHOR_INVOCATION), core.tags)),
  ...prefixesOf(PLAIN_CORE).map(wrap => prefixed(PLAIN_CORE, ANCHOR_INVOCATION, wrap)),
]);

function composedCore(rng, core, invocation) {
  const prefixes = prefixesOf(core);
  if (prefixes.length === 0 || rng() >= PREFIX_ODDS) return entry(bare(core, invocation), core.tags);
  return prefixed(core, invocation, pick(rng, prefixes));
}

function withFillers(rng, core, judged) {
  const before = rng() < FILLER_ODDS ? `${pick(rng, FILLERS)}${pick(rng, core.pipeable ? JOINERS_BEFORE : JOINERS_AFTER)}` : '';
  const after = rng() < FILLER_ODDS ? `${pick(rng, JOINERS_AFTER)}${pick(rng, FILLERS)}` : '';
  return entry(`${before}${judged.text}${after}`, judged.tags);
}

function composed(rng) {
  const core = pick(rng, CORE_SHAPES);
  return withFillers(rng, core, composedCore(rng, core, pick(rng, GIT_INVOCATIONS)));
}

/**
 * The anchor rows first (every core shape once, then every prefix over the plain core), then random
 * compositions of one judged core between optional plain fillers.
 * @param {number} seed
 * @param {number} cap
 * @returns {ReadonlyArray<{ text: string, tags: ReadonlyArray<string> }>}
 */
function generatePlainGateCommands(seed, cap) {
  const rng = mulberry32(seed);
  const random = Array.from({ length: Math.max(cap - ANCHORS.length, 0) }, () => composed(rng));
  return Object.freeze([...ANCHORS, ...random].slice(0, cap));
}

// ---------------------------------------------------------------- stubs

const argvWrapperStub = shifted => ['#!/bin/sh', `shift ${shifted}`, 'exec "$@"', ''].join('\n');
const STRING_RUNNER_STUB = ['#!/bin/sh', 'for last; do :; done', 'exec /bin/sh -c "$last"', ''].join('\n');
const SSH_STUB = ['#!/bin/sh', 'shift 1', 'exec /bin/sh -c "$*"', ''].join('\n');
// The count is the option words the generator always spells for that name.
const ARGV_WRAPPER_SHIFTS = Object.freeze({
  stdbuf: 1, caffeinate: 0, setsid: 0, chrt: 2, taskset: 1, unbuffer: 0, doas: 0, strace: 1, flock: 1, xcrun: 0,
  arch: 1, sudo: 0, timeout: 1, nice: 0, nohup: 0,
});

const STUBS = Object.freeze({
  ...Object.fromEntries(Object.entries(ARGV_WRAPPER_SHIFTS).map(([name, shifted]) => [name, argvWrapperStub(shifted)])),
  ssh: SSH_STUB,
  watch: STRING_RUNNER_STUB,
  tmux: STRING_RUNNER_STUB,
  parallel: STRING_RUNNER_STUB,
});

function installStubs(binDir) {
  for (const [name, script] of Object.entries(STUBS)) writeFileSync(join(binDir, name), script, { mode: EXECUTABLE_MODE });
}

export {
  ANCHORS,
  CORE_SHAPES,
  PLAIN_GATE_FALSE_BLOCK_TAGS,
  PLAIN_GATE_TAGS,
  SHELL_DEPENDENT_TAGS,
  STUBS,
  generatePlainGateCommands,
  installStubs,
};
```

(`'git commit -m "a\\\\b"'` is the JS spelling of the shell text `git commit -m "a\\b"`.)

### TDD steps

1. RED — create `adapters/copilot/test/git-guard.differential.test.js` with the header below and the
   first four tests of the `describe` (determinism, tag reach, anchors, coincidence). Expected
   failure: the whole file errors with `ERR_MODULE_NOT_FOUND` for
   `../../../engine/test-helpers/plain-gate-generator.js` — the module does not exist yet.

   ```js
   import { describe, it } from 'node:test';
   import assert from 'node:assert/strict';
   import {
     ANCHORS,
     CORE_SHAPES,
     PLAIN_GATE_TAGS,
     generatePlainGateCommands,
   } from '../../../engine/test-helpers/plain-gate-generator.js';

   // Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults.
   const parseSeeds = text => text.split(',').map(Number);
   const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
   const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
   // The gate reads a -c or --config-env word as a git config key, so such a word would block for a reason other than the rule under test.
   const ATTACHED_CONFIG_WORD = /^(?:--config-env|-c.)/is;
   const readsAsConfigFlag = word => word === '-c' || ATTACHED_CONFIG_WORD.test(word);
   const COINCIDENCE_FREE_CLASSES = Object.freeze([PLAIN_GATE_TAGS.evaluatorWord, PLAIN_GATE_TAGS.argvWrapper, PLAIN_GATE_TAGS.residual]);

   const countBy = items => items.reduce((counts, item) => ({ ...counts, [item]: (counts[item] ?? 0) + 1 }), {});
   const wordsOf = text => text.split(/\s+/).map(word => word.replace(/^'|'$/g, ''));

   describe('plain gate generator - deterministic, coincidence-free, every class reached', () => {
     it('Given the fixed seeds, when the commands are generated twice, then both lists are identical and hold the cap', () => {
       const sut = generatePlainGateCommands;

       for (const seed of SEEDS) {
         const result = sut(seed, CAP);

         assert.deepEqual(result, sut(seed, CAP));
         assert.equal(result.length, CAP);
       }
     });

     it('Given the default seed, when the tags are counted, then every class tag is reached', () => {
       const sut = generatePlainGateCommands(SEEDS[0], CAP);

       const result = countBy(sut.flatMap(entry => entry.tags));

       for (const tag of Object.values(PLAIN_GATE_TAGS)) assert.ok((result[tag] ?? 0) > 0, `generator never reached ${tag}`);
     });

     it('Given every core shape, when generated with no prefix and no filler, then the anchor list holds it exactly once', () => {
       const sut = generatePlainGateCommands(SEEDS[0], CAP).slice(0, ANCHORS.length).map(entry => entry.text);

       for (const core of CORE_SHAPES) {
         const result = sut.filter(text => text === `${core.head}${core.render('git push')}`);

         assert.equal(result.length, 1, `${core.head}${core.render('git push')}`);
       }
     });

     it('Given the evaluator, wrapper and runner shapes, when their words are scanned, then none reads as a git config flag', () => {
       const sut = CORE_SHAPES.filter(core => core.tags.some(tag => COINCIDENCE_FREE_CLASSES.includes(tag)));

       const result = sut.flatMap(core => wordsOf(`${core.head}${core.render('git push')}`)).filter(readsAsConfigFlag);

       assert.deepEqual(result, []);
     });
   });
   ```

2. GREEN — create `engine/test-helpers/plain-gate-generator.js` with everything in the Context
   block EXCEPT the `// ---- stubs` section (no `argvWrapperStub`, `STRING_RUNNER_STUB`, `SSH_STUB`,
   `ARGV_WRAPPER_SHIFTS`, `STUBS`, `installStubs`; drop `join`/`writeFileSync`/`EXECUTABLE_MODE` and
   the two stub names from the export list). 4 pass.

3. RED — extend the test header and append the stub tests inside the same `describe`. Header
   additions: `import { execFileSync } from 'node:child_process';`,
   `import { mkdtempSync, rmSync } from 'node:fs';`, `import { tmpdir } from 'node:os';`,
   `import { join } from 'node:path';`, `STUBS` and `installStubs` in the generator import, and after
   `COINCIDENCE_FREE_CLASSES`:

   ```js
   const STUBBED_NAMES = Object.freeze([
     'arch', 'caffeinate', 'chrt', 'doas', 'flock', 'nice', 'nohup', 'parallel', 'setsid', 'ssh', 'stdbuf', 'strace', 'sudo', 'taskset',
     'timeout', 'tmux', 'unbuffer', 'watch', 'xcrun',
   ]);
   ```

   Expected failure: the file errors with `SyntaxError: The requested module
   '../../../engine/test-helpers/plain-gate-generator.js' does not provide an export named 'STUBS'`.
   Tests:

   ```js
     it('Given the stubs, when listed, then every external wrapper and runner the generator names is stubbed', () => {
       const sut = STUBS;

       const result = Object.keys(sut).sort();

       assert.deepEqual(result, STUBBED_NAMES);
     });

     for (const { label, argv } of [
       { label: 'an argv wrapper', argv: ['chrt', '-o', '0', 'printf', '%s', 'ran'] },
       { label: 'a string runner', argv: ['watch', '-n1', '-t', 'printf %s ran'] },
       { label: 'the ssh stub', argv: ['ssh', 'host', 'printf', '%s', 'ran'] },
     ]) {
       it(`Given ${label} stub installed in a temp bin, when run with a probe argv, then it runs the wrapped command`, () => {
         const bin = mkdtempSync(join(tmpdir(), 'craft-plain-gate-stubs-'));
         try {
           installStubs(bin);
           const sut = join(bin, argv[0]);

           const result = execFileSync(sut, argv.slice(1), { encoding: 'utf8' });

           assert.equal(result, 'ran');
         } finally {
           rmSync(bin, { recursive: true, force: true });
         }
       });
     }
   ```

4. GREEN — add the `// ---- stubs` section and the two exports exactly as in the Context block.
   8 pass.

5. REFACTOR — none expected; the module is already split into one-purpose functions under 20 lines.
   Do not touch engine/test-helpers/git-differential-harness.js.

RED evidence for the handback: the `ERR_MODULE_NOT_FOUND` line from step 1 and the missing-export
`SyntaxError` line from step 3.

### Gate

Targeted first: `cd adapters/copilot && node --test test/git-guard.differential.test.js` (8 pass).
Part gate: `bash scripts/ci.sh` (log to a scratch file; grep `not ok`/`^ci:`).

### Commit

`test(copilot): add a plain-gate command generator with run-tree stubs`

## Part 2 — The copilot arm's census, then the gate fix it drives

### Context

Files this part edits:

- `adapters/copilot/test/git-guard.differential.test.js` — EDIT (created in Part 1): add the
  harness and `decideGuard` imports, the census helpers and the census `describe`.
- `engine/src/guards/git-plain-command-gate.js` — EDIT: `WRAPPER_WORDS` (L26-29) gains
  `'mapfile', 'readarray', 'compgen'`. No other code changes.
- `engine/test/guards/git-plain-command-gate.test.js` — EDIT: rows appended to `COMPLEX_COMMANDS`
  (array starts L7, ends L154 with `"git status; 'a\"b' x",`) and to `PLAIN_COMMANDS` (starts L156,
  ends L213 with `"echo 'a\"b'; git status",`). Each row becomes one `it` through the existing loops
  at L215-236 (`JSON.stringify(command)` in the title — the new rows are printable ASCII, so the
  titles stay valid).

Public-surface decision: no new export. `WRAPPER_WORDS` is module-private; `gitPlainCommandGate`'s
signature is unchanged. Its behaviour change reaches both bindings that call
`plainGitCommandVerdict` (engine/src/guards/git-bash-verdict.js): copilot
(adapters/copilot/src/git-guard-adapter.js `copilotGuard`) and codex
(adapters/codex/src/git-guard-adapter.js:171). Pre-validated: the codex suite stays 712/0 and no test
anywhere mentions `mapfile`/`readarray`/`compgen` today. The only doc surfaces that list the
command-position words are docs/contributing/specs/gate.md:203-206 and adapters/copilot/README.md:91-94
— Part 3 updates both; no test pins their text.

Current code being changed (engine/src/guards/git-plain-command-gate.js L26-29):

```js
const WRAPPER_WORDS = Object.freeze(new Set([
  'env', 'exec', 'command', 'nohup', 'time', 'sudo', 'nice', 'timeout', 'xargs', 'source', '.',
  'trap', 'hash', 'builtin', 'enable', 'fc', 'coproc', 'alias',
]));
```

`isWrapperWord` (L77) already applies `baseName` (path strip, zsh `=` strip, lower-case), and
`isOpaqueCommand` checks it only for command-position words (`words.commands`), which survive
redirects, assignments and `KEEPS_COMMAND_POSITION` words. So `git grep mapfile` and
`git log | grep mapfile` stay allowed.

Collaborators of the census (read-only):

- engine/test-helpers/git-differential-harness.js exports `SANITY_BASH` (`'/bin/bash'`),
  `secondBash()` (first bash ≥ 5 on PATH whose realpath differs from /bin/bash, else `null`),
  `withTree(act)` (mkdtemp tree `{ base, bin, home, runs, repo }`, stub git logging NUL-separated
  argv to `$FUZZ_LOG`, `bin/sh` → /bin/dash when present; removes the tree after `act` settles),
  `mapPool(items, worker)` (8 lanes), `runInShell(shell, command, tree, index)` →
  `{ code, signal, stderr, argvs }` (5 s spawn timeout, PATH = tree.bin first), and
  `oracleVerdict(argvs)` → `{ destructive, extDiff }` (drops argvs holding `RESIDUAL_MARKER`).
- adapters/copilot/src/git-guard-adapter.js `decideGuard(payload, guard = copilotGuard)` (never
  throws). A copilot Bash payload is
  `{ sessionId, timestamp, cwd, toolName: 'bash', toolArgs: JSON.stringify({ command }) }`
  (`toolName` `'bash'` normalises to `Bash`; the same shape as `payload()` in
  adapters/copilot/test/git-guard-adapter.test.js:11-13). In-process only — no hook spawn (ADR-653).
- Pattern to mirror (read-only): the predicate arm's census in
  engine/test/guards/shell-git-invocations.differential.test.js (`problemsOf`, `judgeRun`,
  `fuzzShell`, `failureReport`, the per-(seed, shell) `it` with `skip` when the shell is `null`).

Census rules (ADR-649): a problem is (1) a killed shell, (2) a syntax error on a row not tagged
`shell-dependent`, (3) FALSE ALLOW — the oracle saw a destructive or ext-diff argv (marker-free)
and `decideGuard` allowed, (4) an oracle-clean block whose tags hold none of
`PLAIN_GATE_FALSE_BLOCK_TAGS ∪ {residual}`. The census is strict at scale too; floor and timeout:
`INVOKED_FLOOR = 300` (measured 356 on bash 3.2, 390 on bash 5.2 at the default seed),
`FUZZ_TIMEOUT_MS = 120_000` (the default seed runs in < 2 s per shell; the scale knob measured
36-40 s per leg with 10 legs concurrent, so 60 s would leave too little headroom).

### TDD steps

1. RED (arm) — edit `adapters/copilot/test/git-guard.differential.test.js`:

   Add to the imports:

   ```js
   import {
     SANITY_BASH,
     mapPool,
     oracleVerdict,
     runInShell,
     secondBash,
     withTree,
   } from '../../../engine/test-helpers/git-differential-harness.js';
   ```

   add `PLAIN_GATE_FALSE_BLOCK_TAGS` and `SHELL_DEPENDENT_TAGS` to the generator import, and
   `import { decideGuard } from '../src/git-guard-adapter.js';`. After `CAP` add:

   ```js
   const FUZZ_TIMEOUT_MS = 120_000;
   // Measured on the default seed: 356 under /bin/bash 3.2, 390 under bash 5.2.
   const INVOKED_FLOOR = 300;
   const SECOND_BASH = secondBash();
   const SYNTAX_ERROR = /syntax error|unexpected EOF/;
   const ACCEPTED_BLOCK_TAGS = Object.freeze([...PLAIN_GATE_FALSE_BLOCK_TAGS, PLAIN_GATE_TAGS.residual]);
   ```

   After `STUBBED_NAMES` add the helpers:

   ```js
   const bashPayload = command => ({ sessionId: 's1', timestamp: 0, cwd: '/repo', toolName: 'bash', toolArgs: JSON.stringify({ command }) });
   const blocks = command => decideGuard(bashPayload(command)).block;
   const hasAny = (entry, tags) => tags.some(tag => entry.tags.includes(tag));

   function verdictsOf(entry, run) {
     const oracle = oracleVerdict(run.argvs);
     return { oracleBlocks: oracle.destructive || oracle.extDiff, blocked: blocks(entry.text) };
   }

   function problemsOf(entry, run, { oracleBlocks, blocked }) {
     const problems = [];
     if (run.signal !== null) problems.push(`shell was killed (${run.signal})`);
     if (SYNTAX_ERROR.test(run.stderr) && !hasAny(entry, SHELL_DEPENDENT_TAGS)) problems.push(`generator emitted invalid shell: ${run.stderr.trim().replaceAll('\n', ' / ')}`);
     if (oracleBlocks && !blocked) problems.push(`FALSE ALLOW: the shell ran ${JSON.stringify(run.argvs)} and copilotGuard allowed it`);
     if (blocked && !oracleBlocks && !hasAny(entry, ACCEPTED_BLOCK_TAGS)) problems.push('unexpected false block (no intended-false-block class)');
     return problems;
   }

   function judgeRun(entry, run) {
     const verdicts = verdictsOf(entry, run);
     const falseBlock = verdicts.blocked && !verdicts.oracleBlocks;
     return {
       problems: problemsOf(entry, run, verdicts),
       invoked: run.argvs.length > 0,
       falseBlockTags: falseBlock ? entry.tags.filter(tag => ACCEPTED_BLOCK_TAGS.includes(tag)) : [],
     };
   }

   function fuzzShell(shell, commands) {
     return withTree(async tree => {
       installStubs(tree.bin);
       const runs = await mapPool(commands, (entry, index) => runInShell(shell, entry.text, tree, index));
       return commands.map((entry, index) => judgeRun(entry, runs[index]));
     });
   }

   const failureReport = (commands, verdicts) =>
     verdicts.flatMap((verdict, index) => verdict.problems.map(problem => `${problem} :: ${JSON.stringify(commands[index].text)}`)).join('\n');
   ```

   and at the end of the file the census `describe`:

   ```js
   describe('copilot git guard - differential fuzz of the plain-command gate against real bash', { concurrency: true }, () => {
     for (const seed of SEEDS) {
       const commands = generatePlainGateCommands(seed, CAP);
       for (const [name, shell] of [['/bin/bash', SANITY_BASH], ['the first bash >= 5 on PATH', SECOND_BASH]]) {
         it(
           `Given every command of seed ${seed}, when ${name} runs it against a stub git, then copilotGuard never allows what the shell ran`,
           { timeout: FUZZ_TIMEOUT_MS, skip: shell === null ? 'no second bash >= 5 on PATH' : false },
           async t => {
             const sut = fuzzShell;
             const started = Date.now();

             const result = await sut(shell, commands);

             const invoked = result.filter(verdict => verdict.invoked).length;
             t.diagnostic(`generated ${commands.length}, invoked ${invoked}, false blocks ${JSON.stringify(countBy(result.flatMap(verdict => verdict.falseBlockTags)))}, wall ${Date.now() - started} ms`);
             const report = failureReport(commands, result);
             assert.ok(report === '', `\n${report}`);
             assert.ok(invoked >= INVOKED_FLOOR, `only ${invoked} commands logged a git argv`);
           }
         );
       }
     }
   });
   ```

   Expected failure on macOS (`/bin/bash` 3.2), pre-validated — exactly these two lines:

   ```
   FALSE ALLOW: the shell ran [["push","","x",""]] and copilotGuard allowed it :: "compgen -C 'git push' x"
   FALSE ALLOW: the shell ran [["log","-1"],["reset","--hard","","x",""]] and copilotGuard allowed it :: "git log -1\n2>/dev/null compgen -C 'git reset --hard' x && true"
   ```

   With a bash 5.2 on PATH the second leg also fails with 14 FALSE ALLOW lines, e.g.
   `[["push","0","1"],["push","1","2"]] … "seq 2 | mapfile -tc1 -C 'git push'"`,
   `… "seq 2 | readarray -tc1 -C 'git push'"`, `[["push","compgen","x",""]] … "compgen -C 'git push' x"`.
   On Linux CI (bash 5 as /bin/bash) the first leg shows the bash-5 set. Record the macOS output
   (and the bash-5 output if you built one) in the handback. The generator self-tests stay green.
   Do NOT commit here.

2. RED (unit) — append to `COMPLEX_COMMANDS` in `engine/test/guards/git-plain-command-gate.test.js`
   (after `"git status; 'a\"b' x",`):

   ```js
     "seq 3 | mapfile -tc1 -C 'git push'",
     "seq 3 | readarray -tc1 -C 'git push'",
     "compgen -C 'git push' x",
     "git status; compgen -C x y",
     "if true; then mapfile -tC 'git push'; fi",
   ```

   Expected failure: 5 `not ok` rows, each `actual: false, expected: true` on `.block` — today's gate
   returns `{ block: false }` for all five (none holds a `-c` word, so `configOperands` cannot block
   them either).

3. GUARD (unit) — append to `PLAIN_COMMANDS` (after `"echo 'a\"b'; git status",`):

   ```js
     'git log | grep mapfile',
     'git grep mapfile',
     'git add compgen.md',
   ```

   They pass today (no word in command position is a wrapper) and must still pass after GREEN: the
   new words are judged in command position only.

4. GREEN — `engine/src/guards/git-plain-command-gate.js`:

   ```js
   const WRAPPER_WORDS = Object.freeze(new Set([
     'env', 'exec', 'command', 'nohup', 'time', 'sudo', 'nice', 'timeout', 'xargs', 'source', '.',
     'trap', 'hash', 'builtin', 'enable', 'fc', 'coproc', 'alias',
     // Their -C callback is shell text the builtin evaluates.
     'mapfile', 'readarray', 'compgen',
   ]));
   ```

   The unit rows pass (engine gate suite 213/0 pre-validated) and the census is green on every shell
   present (bash 3.2: invoked 356; bash 5.2: invoked 390).

5. REFACTOR — none. Run the scale knob once and fold any finding into this part:
   `cd adapters/copilot && GUARD_FUZZ_SEEDS=1,2,3,4,5 GUARD_FUZZ_COUNT=2000 node --test test/git-guard.differential.test.js`
   (pre-validated green on bash 3.2 and 5.2, ~40 s per leg). Report its diagnostics in the handback.

Mutation note for the validation phase (not run in this part): Stryker over
engine/src/guards/git-plain-command-gate.js with ONE comma-separated `--mutate` (repeated flags keep
only the last). The three new `StringLiteral` mutants (`""`) are killed by their own rows: `mapfile`
by rows 1 and 5, `readarray` by row 2, `compgen` by rows 3 and 4.

### Gate

Targeted first: `cd engine && node --test test/guards/git-plain-command-gate.test.js`, then
`cd adapters/copilot && node --test test/git-guard.differential.test.js`, then
`cd adapters/codex && node --test 'test/**/*.test.js'` (the gate is shared).
Part gate: `bash scripts/ci.sh`.

### Commit

`fix(guards): judge copilot through a plain-gate fuzz arm and deny callback builtins in command position`

## Part 3 — Living docs and the two BACKLOG entries

### Context

Files this part edits:

- `docs/contributing/specs/gate.md` — EDIT, copilot binding section.
- `adapters/copilot/README.md` — EDIT, gate section.
- `BACKLOG.md` — EDIT, two entries rewritten in place (nothing added, nothing moved).

Public-surface decision: no code surface. These docs are in the intention-lint living corpus
(`scripts/living-corpus.sh` → `node engine/bin/intention-lint.js`, run by ci.sh) and the touched-diff
prose-lint; keep sentences plain, no provenance ids in gate.md or the README (ADR numbers belong only
in BACKLOG.md), no `stryker`/`mutation`/`github` words in gate.md or the README.

Edits, exact:

1. Command-position list — gate.md L205-206 and README L93-94 both read
   ``…`env exec command nohup time sudo nice timeout xargs source . trap hash`` /
   ``  builtin enable fc coproc alias` deny in command position.``. Replace the end in both with:
   ``builtin enable fc coproc alias mapfile readarray compgen` deny in command position (the last
   three run their `-C` callback as shell text).``

2. gate.md "Near-git rules" (L195): "three rules" → "four rules", and after the shells bullet
   (ends L206) add the bullet the README already has (README L95), verbatim:
   ``- A command word that opens with `=` denies: zsh expands `=git` to git's path.``

3. README residual bullet "**Git reached through channels a static guard cannot follow**"
   (L113-117): replace ``scripts, `make`, `npm run`, `ssh host '…'`, `git rebase --exec`;`` with
   ``scripts, `make`, `npm run`, a heredoc written to a file and run later, `watch`, `ssh host '…'`,
   `su -c`, `script -c`, `parallel`, `git rebase --exec`;`` (the gate.md L227-233 list, same order).

4. Intended false blocks, quoted-word rule:
   - README L131: replace ``an apostrophe plus `$` in a quoted word (`git commit -m "it's $HOME"`);``
     with ``a `$` or backtick in any quoted word, or a `\` or `!` in a double-quoted one
     (`git commit -m 'cost $5'`, `git commit -m "stop!"`); a callback builtin in command position
     (`git log | mapfile -t a`);``
   - gate.md L257: replace ``  `git commit -m "it's $HOME"`;`` with the same text.
   The `mapfile` clause records the deliberate new false block (design "Edge behaviour"); it is the
   doc line the arm's `evaluator-word` tag maps to, beside `bash -c 'git status'`.

Tag → living-doc rule map the reviewer checks (each tag in `PLAIN_GATE_FALSE_BLOCK_TAGS` maps to one
stated rule; ADR-649):

| Tag | Rule stated in both docs |
|---|---|
| `quoted-expansion` | the quoted-word rule (edit 4) |
| `unplain-character` | plainness: `git log # c`, `git diff > o < i`, non-plain characters |
| `evaluator-word` | shells anywhere / command-position words (edit 1), `bash -c 'git status'`, `git log \| mapfile -t a` |
| `unsafe-config` | the `-c`/`--config-env` safe set and `GIT_<NAME>=` rules |
| `any-word-anchor` | `echo git push` (any-word anchoring) |
| `control-flow-unreached` | control-flow-unreached git (`a && git push`) |
| `residual` | the "Git reached through channels…" residual list (edit 3) |

BACKLOG.md rewrites (convention: the entry that starts
`**The Claude ext-diff hook shares the anchor and global-option gaps — delivered 2026-10-18**` at
BACKLOG.md:310 — bold title ending "— delivered <date>", then `(branch, ADRs: what changed)`, then
`Design: [..](..)`, then `Original entry:` and the original text verbatim):

- L319-323, "**A copilot-level differential fuzz arm.**" becomes:

  ```markdown
  **A copilot-level differential fuzz arm — delivered 2026-10-18**
  (fix/copilot-guard-differential-fuzz-arm, ADR-649, ADR-650, ADR-651, ADR-652, ADR-653: a plain-gate
  generator, engine/test-helpers/plain-gate-generator.js, feeds one judged fragment per command, from
  idiom bodies, evaluator builtins, redirect and reserved-word prefixes, unlisted wrappers and string
  runners, to real `/bin/bash` and the first bash ≥ 5 on PATH, and
  `adapters/copilot/test/git-guard.differential.test.js` judges each through `decideGuard` under a
  strict two-sided census. It proved `compgen -C` (bash 3.2 and 5) and `mapfile`/`readarray -tc1 -C`
  (bash ≥ 4) ran git past the gate; the gate now denies `mapfile`, `readarray` and `compgen` in
  command position). Design:
  [copilot-guard-differential-fuzz-arm](docs/contributing/design/copilot-guard-differential-fuzz-arm.md).
  Original entry: The committed fuzz
  (`engine/test/guards/shell-git-invocations.differential.test.js`) exercises the shared predicates only,
  never `copilotGuard` and its plain-command gate, so it could not find the gate's idiom-smuggling and
  command-position bypasses that review found by hand. Add a generator arm (idiom bodies, evaluator
  builtins, redirect/reserved-word prefixes, unlisted wrappers) judged through `copilotGuard`.
  ```

- L351-358, "**The copilot "intended false blocks" list understates the quoted-word rule.**" becomes:

  ```markdown
  **The copilot "intended false blocks" list understates the quoted-word rule — delivered 2026-10-18**
  (fix/copilot-guard-differential-fuzz-arm, ADR-654: `adapters/copilot/README.md` and
  `docs/contributing/specs/gate.md` now state the rule — a `$` or backtick in any quoted word, or a `\`
  or `!` in a double-quoted one — and the copilot fuzz arm's `quoted-expansion` tag pins it). Design:
  [copilot-guard-differential-fuzz-arm](docs/contributing/design/copilot-guard-differential-fuzz-arm.md).
  Original entry: `adapters/copilot/README.md`
  and `docs/contributing/specs/gate.md` list "an apostrophe plus `$` in a quoted word
  (`git commit -m "it's $HOME"`)", … (keep the rest of the original text verbatim, through
  "Restate the item as the rule.")
  ```

  Keep the whole original body after `Original entry:` byte-for-byte (L351-358 from
  "`adapters/copilot/README.md`" to "Restate the item as the rule.").

Both entries stay where they are (the section they sit in is not moved; no `### Closed` move). No new
BACKLOG entry is filed. Leave "The fuzz goes red at scale…" (L325) untouched.

### TDD steps

Docs-only part: no RED/GREEN code cycle.

1. GUARD — before editing, `bash scripts/backlog-lint.sh BACKLOG.md` and
   `node engine/bin/intention-lint.js $(bash scripts/living-corpus.sh)` pass (they pass today).
2. Apply edits 1-4 and the two BACKLOG rewrites.
3. GUARD — re-run both lints, then `grep -n "apostrophe plus" adapters/copilot/README.md
   docs/contributing/specs/gate.md` returns nothing, `grep -n "mapfile readarray compgen"` hits both
   files, and gate.md says "four rules".

### Gate

Targeted first: `bash scripts/backlog-lint.sh BACKLOG.md` and the intention lint above.
Part gate: `bash scripts/ci.sh`.

### Commit

`docs(copilot): state the callback-builtin words, the real quoted-word rule and the full residual list`
