/**
 * In-process unit tests for plan-lint-main: schema parity with the retired awk
 * script first (each row of the observable-contract table), then the
 * cross-part cognitive-locality overlap advisory.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/plan-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmpRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'planlint-main-'));
  tmpDirs.push(dir);
  return dir;
}

function writePlan(root, content, name = 'plan.md') {
  const path = join(root, name);
  writeFileSync(path, content);
  return path;
}

/** A tmp root that resolves as its own repo root (a `.git` file marker), with
 * a nested source tree for backticked spans to resolve against. */
function repoRoot() {
  const root = tmpRoot();
  writeFileSync(join(root, '.git'), '');
  mkdirSync(join(root, 'engine', 'src'), { recursive: true });
  writeFileSync(join(root, 'engine', 'src', 'findings.js'), '// shared\n');
  writeFileSync(join(root, 'engine', 'src', 'other.js'), '// other\n');
  return root;
}

function part(label, contextBody, extra = '') {
  return `## Part ${label} — ${label} thing\n\n### Context\n\n${contextBody}\n\n### TDD steps\n\n1. RED then GREEN.\n\n### Gate\n\necho ok\n\n### Commit\n\nfeat: ${label} thing\n${extra}`;
}

const GOOD_PLAN = `# Plan — Test topic

## Part 1 — first thing

### Context

Do the first thing.

### TDD steps

1. RED then GREEN.

### Gate

echo ok

### Commit

feat: first thing

## Part 2 — second thing

### Context

Do the second thing.

### TDD steps

1. RED then GREEN.

### Gate

echo ok

### Commit

feat: second thing
`;

const MISSING_SECTION_PLAN = `# Plan — Test topic

## Part 1 — first thing

### Context

Do the first thing.

### TDD steps

1. RED then GREEN.

### Commit

feat: first thing
`;

// ─── row: file missing → stderr, exit 2 ──────────────────────────────────────

test('Given a nonexistent plan path, when main runs, then it reports "no such file" on stderr and exits 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['/no/such/plan.md'], io);

  assert.equal(result, 2);
  assert.equal(io.stderr.joined(), 'plan-lint: no such file: /no/such/plan.md\n');
  assert.equal(io.stdout.joined(), '');
});

// ─── row: missing argv → stderr usage, exit 2 (the one deliberate behaviour change) ──

test('Given no plan path argument, when main runs, then it reports usage on stderr and exits 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 2);
  assert.equal(io.stderr.joined(), 'plan-lint: usage: plan-lint <plan-file>\n');
  assert.equal(io.stdout.joined(), '');
});

// ─── row: part missing sections → stdout names the heading + missing names, in REQUIRED order ──

test('Given a part missing ### Gate, when main runs, then it reports the missing section by name', () => {
  const sut = main;
  const root = tmpRoot();
  const path = writePlan(root, MISSING_SECTION_PLAN);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('plan-lint: part "## Part 1 — first thing" missing: ### Gate\n'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given a part missing both ### Gate and ### Commit, when main runs, then it lists both missing sections in REQUIRED order', () => {
  const sut = main;
  const root = tmpRoot();
  const path = writePlan(root, '# Plan — Test topic\n\n## Part 1 — first thing\n\n### Context\n\nDo the first thing.\n\n### TDD steps\n\n1. RED then GREEN.\n');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('plan-lint: part "## Part 1 — first thing" missing: ### Gate, ### Commit\n'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

// ─── row: no "## Part" found → stdout, exit 2 ────────────────────────────────

test('Given a plan file with no "## Part" heading, when main runs, then it reports "not a craft plan" and exits 2', () => {
  const sut = main;
  const root = tmpRoot();
  const path = writePlan(root, '# Plan — Test topic\n\nNo parts here.\n');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), 'plan-lint: no "## Part" sections found — not a craft plan.\n');
});

// ─── row: ≥1 bad part → final violate-schema summary line, exit 2 ───────────

test('Given a plan with one schema-violating part, when main runs, then it prints the violate-schema summary and exits 2', () => {
  const sut = main;
  const root = tmpRoot();
  const path = writePlan(root, MISSING_SECTION_PLAN);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('plan-lint: 1 part(s) violate the schema. The plan phase cannot close.\n'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

// ─── row: all parts OK → stdout summary, exit 0 ──────────────────────────────

test('Given a schema-valid two-part plan, when main runs, then it prints the OK summary and exits 0', () => {
  const sut = main;
  const root = tmpRoot();
  const path = writePlan(root, GOOD_PLAN);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), 'plan-lint: 2 part(s) OK — every part carries its context block.\n');
});

// ─── the prefix-match quirk: "## Partition …" is treated as a part heading ───

test('Given a heading "## Partition …" with no required sections, when main runs, then it is treated as a part and reported missing (the preserved awk quirk)', () => {
  const sut = main;
  const root = tmpRoot();
  const path = writePlan(root, '# Plan — Test topic\n\n## Partition of risk\n\nSome prose, no sections.\n');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('plan-lint: part "## Partition of risk" missing: ### Context, ### TDD steps, ### Gate, ### Commit\n'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

// ─── cross-part cognitive-locality overlap advisory ──────────────────────────

test('Given two parts whose Context blocks both backtick the same existing file, when main runs, then it emits one warning naming both part labels and the exit code is unchanged', () => {
  const sut = main;
  const root = repoRoot();
  const plan = `# Plan — Test topic\n\n${part('1', 'Edit `engine/src/findings.js` here.')}\n\n${part('2', 'Also edit `engine/src/findings.js` here.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes(
      'plan-lint: cognitive-locality warning — `engine/src/findings.js` declared in Part 1, Part 2. Merge the parts or state why they are separate.\n',
    ),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given two parts naming disjoint files, when main runs, then no warning is emitted', () => {
  const sut = main;
  const root = repoRoot();
  const plan = `# Plan — Test topic\n\n${part('1', 'Edit `engine/src/findings.js` here.')}\n\n${part('2', 'Edit `engine/src/other.js` here.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('cognitive-locality'), `stdout was: ${io.stdout.joined()}`);
});

test('Given three parts sharing one declared file, when main runs, then it emits one warning naming all three part labels', () => {
  const sut = main;
  const root = repoRoot();
  const plan = `# Plan — Test topic\n\n${part('1', 'Edit `engine/src/findings.js` here.')}\n\n${part('2', 'Also edit `engine/src/findings.js` here.')}\n\n${part('3', 'And again `engine/src/findings.js` here.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes('`engine/src/findings.js` declared in Part 1, Part 2, Part 3.'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given a single-part plan, when main runs, then no warning is emitted, and duplicating its declared span into a second part proves the detector actually resolves it (non-vacuous guard)', () => {
  const sut = main;
  const root = repoRoot();
  const contextBody = 'Edit `engine/src/findings.js` here.';

  const singlePath = writePlan(root, `# Plan — Test topic\n\n${part('1', contextBody)}`, 'single.md');
  const singleIo = makeCaptureIo();
  const singleResult = sut([singlePath], singleIo);

  assert.equal(singleResult, 0, `stderr: ${singleIo.stderr.joined()}`);
  assert.ok(!singleIo.stdout.joined().includes('cognitive-locality'), `stdout was: ${singleIo.stdout.joined()}`);

  // Non-vacuous guard: duplicate the exact same declared span into a second part.
  // If the detector actually resolves `engine/src/findings.js` as a file (rather
  // than silently finding nothing, ever), this duplicate MUST now warn — proving
  // the clean single-part result above reflects a working detector, not a broken one.
  const duplicatedPath = writePlan(root, `# Plan — Test topic\n\n${part('1', contextBody)}\n\n${part('2', contextBody)}`, 'duplicated.md');
  const duplicatedIo = makeCaptureIo();
  const duplicatedResult = sut([duplicatedPath], duplicatedIo);

  assert.equal(duplicatedResult, 0, `stderr: ${duplicatedIo.stderr.joined()}`);
  assert.ok(duplicatedIo.stdout.joined().includes('cognitive-locality'), `stdout was: ${duplicatedIo.stdout.joined()}`);
});

test('Given a Context block naming a path in prose without backticks, when main runs, then no warning is emitted (under-report by design)', () => {
  const sut = main;
  const root = repoRoot();
  const plan = `# Plan — Test topic\n\n${part('1', 'Edit engine/src/findings.js here, unbackticked.')}\n\n${part('2', 'Also edit engine/src/findings.js here, unbackticked.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('cognitive-locality'), `stdout was: ${io.stdout.joined()}`);
});

test('Given two parts both backticking the same directory span, when main runs, then no warning is emitted (directory spans are not paths)', () => {
  const sut = main;
  const root = repoRoot();
  const plan = `# Plan — Test topic\n\n${part('1', 'Edit files under `engine/src/` here.')}\n\n${part('2', 'Also edit files under `engine/src/` here.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('cognitive-locality'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a backticked span that resolves to nothing, when main runs, then no warning is emitted', () => {
  const sut = main;
  const root = repoRoot();
  const plan = `# Plan — Test topic\n\n${part('1', 'See `engine/src/does-not-exist.js` for reference.')}\n\n${part('2', 'See `engine/src/does-not-exist.js` too.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('cognitive-locality'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a schema-invalid plan that also overlaps, when main runs, then it still exits 2 with the existing violate-schema message (no regression on the gate)', () => {
  const sut = main;
  const root = repoRoot();
  const badPart1 = '## Part 1 — first thing\n\n### Context\n\nEdit `engine/src/findings.js` here.\n';
  const plan = `# Plan — Test topic\n\n${badPart1}\n\n${part('2', 'Also edit `engine/src/findings.js` here.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('plan-lint: 1 part(s) violate the schema. The plan phase cannot close.\n'),
    `stdout was: ${io.stdout.joined()}`,
  );
  assert.ok(
    io.stdout.joined().includes('`engine/src/findings.js` declared in Part 1, Part 2.'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given a repo root with no ancestor .git entry, when main runs over a plan naming an existing file relative to the plan directory, then the overlap warning still fires', () => {
  const sut = main;
  const root = tmpRoot(); // no `.git` marker anywhere up the chain (within the tmp tree)
  mkdirSync(join(root, 'engine', 'src'), { recursive: true });
  writeFileSync(join(root, 'engine', 'src', 'findings.js'), '// shared\n');
  const plan = `# Plan — Test topic\n\n${part('1', 'Edit `engine/src/findings.js` here.')}\n\n${part('2', 'Also edit `engine/src/findings.js` here.')}`;
  const path = writePlan(root, plan);
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes('`engine/src/findings.js` declared in Part 1, Part 2.'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given one part declaring the same file twice, when main runs, then no self-overlap warning is emitted', () => {
  const sut = main;
  const root = repoRoot();
  const body = 'Edit `engine/src/findings.js` and again `engine/src/findings.js` here.';
  const path = writePlan(root, `# Plan — Test topic\n\n${part('1', body)}`, 'dup-span.md');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('cognitive-locality'), `stdout was: ${io.stdout.joined()}`);
});

test('Given two parts sharing two files, when main runs, then the warnings are ordered lexicographically by path', () => {
  const sut = main;
  const root = repoRoot();
  const body = 'Edit `engine/src/other.js` and `engine/src/findings.js` here.';
  const plan = `# Plan — Test topic\n\n${part('1', body)}\n\n${part('2', body)}`;
  const path = writePlan(root, plan, 'two-shared.md');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const out = io.stdout.joined();
  assert.ok(out.indexOf('findings.js') < out.indexOf('other.js'), `stdout was: ${out}`);
});

test('Given a plan that declares its own path in two parts, when main runs, then the self-reference is not warned about', () => {
  const sut = main;
  const root = repoRoot();
  // The span must be the path as it actually resolves under repoRoot, or the
  // exclusion branch is never reached and this test proves nothing.
  const body = 'See `self.md` for the provenance.';
  const plan = `# Plan — Test topic\n\n${part('1', body)}\n\n${part('2', body)}`;
  const path = writePlan(root, plan, 'self.md');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('cognitive-locality'), `stdout was: ${io.stdout.joined()}`);
});

test('Given the identical span in a plan that is NOT that file, when main runs, then it does warn (premise for the self-exclusion)', () => {
  const sut = main;
  const root = repoRoot();
  const body = 'See `self.md` for the provenance.';
  const plan = `# Plan — Test topic\n\n${part('1', body)}\n\n${part('2', body)}`;
  writePlan(root, '# placeholder\n', 'self.md');
  const path = writePlan(root, plan, 'other.md');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('`self.md` declared in Part 1, Part 2'), io.stdout.joined());
});

test('Given sections headed with three hashes before the first part, when main runs, then they do not satisfy the first part schema', () => {
  const sut = main;
  const root = repoRoot();
  const plan = '# Plan — Test topic\n\n## Preamble\n\n### Context\n\nx\n\n### TDD steps\n\nx\n\n### Gate\n\nx\n\n### Commit\n\nx\n\n## Part 1 — bare\n';
  const path = writePlan(root, plan, 'preamble.md');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes(
      'plan-lint: part "## Part 1 — bare" missing: ### Context, ### TDD steps, ### Gate, ### Commit\n',
    ),
    io.stdout.joined(),
  );
});

test('Given a file declared by more parts than could be merged, when main runs, then it is still reported but as shared infrastructure', () => {
  const sut = main;
  const root = repoRoot();
  const body = 'Touches `engine/src/findings.js` here.';
  const plan = ['1', '2', '3', '4'].map((n) => part(n, body)).join('\n\n');
  const path = writePlan(root, `# Plan — Test topic\n\n${plan}`, 'infra.md');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const out = io.stdout.joined();
  // The signal survives above the limit — only the suggested remedy changes,
  // because "merge the parts" is not an action anyone can take at four parts.
  assert.ok(out.includes('`engine/src/findings.js` declared in 4 parts — shared infrastructure'), out);
  assert.ok(!out.includes('Merge the parts'), out);
});

test('Given a file declared by exactly the merge limit, when main runs, then the mergeable remedy is still offered', () => {
  const sut = main;
  const root = repoRoot();
  const body = 'Touches `engine/src/findings.js` here.';
  const plan = ['1', '2', '3'].map((n) => part(n, body)).join('\n\n');
  const path = writePlan(root, `# Plan — Test topic\n\n${plan}`, 'atlimit.md');
  const io = makeCaptureIo();

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('Merge the parts or state why they are separate.'),
    io.stdout.joined());
});

test('Given a cwd-relative plan path from a subdirectory, when main runs, then the self-exclusion still applies', () => {
  const sut = main;
  const root = repoRoot();
  const subdir = join(root, 'sub');
  mkdirSync(subdir, { recursive: true });
  const body = 'See `sub/self.md` for the provenance.';
  const plan = `# Plan — Test topic\n\n${part('1', body)}\n\n${part('2', body)}`;
  writeFileSync(join(subdir, 'self.md'), plan);
  const io = makeCaptureIo();

  const cwd = process.cwd();
  let result;
  try {
    process.chdir(subdir);
    // Relative argv: without resolve() before containment the self path never
    // matches and the exclusion silently stops applying for this invocation form.
    result = sut(['self.md'], io);
  } finally {
    process.chdir(cwd);
  }

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('cognitive-locality'), io.stdout.joined());
});
