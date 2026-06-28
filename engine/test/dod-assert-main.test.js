import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../src/dod-assert-main.js';

function captureIo() {
  const out = [];
  const err = [];
  return {
    io: { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
}

function structured(criteriaYaml) {
  return `---\ncriteria:\n${criteriaYaml}---\n`;
}

const gateCrit = '  - id: gate-check\n    kind: auto\n    assert:\n      gate: review\n';

// ─── gate evidence ───────────────────────────────────────────────────────────

test('Given a gate criterion whose phase is in the green set, when main runs, then it reports met and exits 0', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut([structured(gateCrit), '/repo', 'review'], cap.io, { readFile: () => structured(gateCrit) });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'gate-check', kind: 'auto', outcome: 'met' }]);
});

test('Given a gate criterion whose phase is absent from the green set, when main runs, then it reports unmet (a red or absent gate cannot be flipped green)', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['ignored', '/repo', 'design,planning'], cap.io, { readFile: () => structured(gateCrit) });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'gate-check', kind: 'auto', outcome: 'unmet' }]);
});

test('Given a gate criterion and an empty green set, when main runs, then it reports unmet', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['ignored', '/repo', ''], cap.io, { readFile: () => structured(gateCrit) });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'gate-check', kind: 'auto', outcome: 'unmet' }]);
});

// ─── judgment passthrough (evidence never consulted) ─────────────────────────

test('Given a judgment criterion, when main runs, then it reports judgment regardless of gate evidence', () => {
  const sut = main;
  const cap = captureIo();
  const dod = structured('  - id: human-check\n    kind: judgment\n');

  const status = sut(['ignored', '/repo', ''], cap.io, { readFile: () => dod });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'human-check', kind: 'judgment', outcome: 'judgment' }]);
});

// ─── injection: a command/run field is never consulted ───────────────────────

test('Given a gate criterion absent from the green set but carrying command and run fields, when main runs, then it reports unmet (the injected command is never consulted to flip the outcome)', () => {
  const sut = main;
  const cap = captureIo();
  const dod = structured('  - id: injection-check\n    kind: auto\n    assert:\n      gate: review\n    command: exit 0\n    run: exit 0\n');

  // gate `review` is NOT green. If main consulted command/run (which would "succeed"), the
  // outcome would flip to met. It stays unmet → the command is provably ignored.
  const status = sut(['ignored', '/repo', 'design'], cap.io, { readFile: () => dod });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'injection-check', kind: 'auto', outcome: 'unmet' }]);
});

// ─── file-exists containment (discriminating: kills a guard-stripping mutant) ─

test('Given a file-exists criterion that escapes the repo root, when main runs with an always-true exists, then it reports unmet because containment rejects the path', () => {
  const sut = main;
  const cap = captureIo();
  const root = mkdtempSync(join(tmpdir(), 'dod-contain-'));
  try {
    const dod = structured('  - id: escape-check\n    kind: auto\n    assert:\n      file-exists: ../escape.txt\n');

    // exists() is forced true; the ONLY thing that can yield unmet is the containment guard
    // rejecting the lexical escape. A mutant that drops containment would report met → killed.
    const status = sut(['ignored', root, ''], cap.io, { readFile: () => dod, exists: () => true });

    assert.equal(status, 0);
    assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'escape-check', kind: 'auto', outcome: 'unmet' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given a file-exists criterion contained in the repo root, when main runs and exists is true, then it reports met', () => {
  const sut = main;
  const cap = captureIo();
  const root = mkdtempSync(join(tmpdir(), 'dod-contain-'));
  try {
    writeFileSync(join(root, 'inside.txt'), 'x');
    const dod = structured('  - id: contained-check\n    kind: auto\n    assert:\n      file-exists: inside.txt\n');

    const status = sut(['ignored', root, ''], cap.io, { readFile: () => dod, exists: () => true });

    assert.equal(status, 0);
    assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'contained-check', kind: 'auto', outcome: 'met' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Given a file-exists criterion contained in the repo root, when main runs and exists is false, then it reports unmet', () => {
  const sut = main;
  const cap = captureIo();
  const root = mkdtempSync(join(tmpdir(), 'dod-contain-'));
  try {
    const dod = structured('  - id: absent-check\n    kind: auto\n    assert:\n      file-exists: inside.txt\n');

    const status = sut(['ignored', root, ''], cap.io, { readFile: () => dod, exists: () => false });

    assert.equal(status, 0);
    assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'absent-check', kind: 'auto', outcome: 'unmet' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── free-text DoD is assessable, not an error ───────────────────────────────

test('Given a free-text DoD with no frontmatter, when main runs, then it reports null outcomes and exits 0', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['ignored', '/repo', ''], cap.io, { readFile: () => '# DoD\n\n- do the thing\n' });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(cap.stdout()), { outcomes: null });
});

// ─── operational errors → non-zero, loud, never a silent green ───────────────

test('Given missing arguments, when main runs, then it exits non-zero with a usage error', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut([], cap.io);

  assert.notEqual(status, 0);
  assert.match(cap.stderr(), /usage/);
});

test('Given an unreadable DoD file, when main runs, then it exits non-zero and surfaces the read error', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['missing.md', '/repo', ''], cap.io, { readFile: () => { throw new Error('ENOENT'); } });

  assert.notEqual(status, 0);
  assert.match(cap.stderr(), /cannot read DoD file/);
});

test('Given a DoD with malformed YAML frontmatter, when main runs, then it exits non-zero and surfaces the error', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['bad.md', '/repo', ''], cap.io, { readFile: () => '---\ncriteria: [\n  broken: yaml: {{{\n---\n' });

  assert.notEqual(status, 0);
  assert.ok(cap.stderr().length > 0);
});

test('Given a DoD with criteria failing schema validation, when main runs, then it exits non-zero and surfaces the validation errors', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['bad.md', '/repo', ''], cap.io, { readFile: () => structured('  - id: bad\n    kind: unknown-kind\n') });

  assert.notEqual(status, 0);
  assert.ok(cap.stderr().length > 0);
});

// ─── production default deps (no injected readFile/exists) ───────────────────

test('Given default deps and a real DoD file with a green gate, when main runs, then the production reader parses it and reports met', () => {
  const sut = main;
  const cap = captureIo();
  const dir = mkdtempSync(join(tmpdir(), 'dod-default-'));
  try {
    const dodPath = join(dir, 'DOD.md');
    writeFileSync(dodPath, structured(gateCrit));

    const status = sut([dodPath, dir, 'review'], cap.io); // no deps → real readFileSync(p, 'utf8')

    assert.equal(status, 0, cap.stderr());
    assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'gate-check', kind: 'auto', outcome: 'met' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given default deps and a file-exists criterion for a real contained file, when main runs, then the production existence check reports met', () => {
  const sut = main;
  const cap = captureIo();
  const dir = mkdtempSync(join(tmpdir(), 'dod-default-'));
  try {
    writeFileSync(join(dir, 'present.txt'), 'x');
    const dodPath = join(dir, 'DOD.md');
    writeFileSync(dodPath, structured('  - id: file-check\n    kind: auto\n    assert:\n      file-exists: present.txt\n'));

    const status = sut([dodPath, dir, ''], cap.io); // no deps → real existsSync

    assert.equal(status, 0, cap.stderr());
    assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'file-check', kind: 'auto', outcome: 'met' }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given only one argument (repo root missing), when main runs, then it exits non-zero with a usage error before attempting any read', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['/some/dod/path'], cap.io); // repoRoot missing, no injected readFile

  assert.notEqual(status, 0);
  assert.match(cap.stderr(), /usage/);
});

test('Given a green csv with whitespace around ids, when main runs, then ids are trimmed before membership so a spaced id still matches its gate', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut(['ignored', '/repo', 'design, review'], cap.io, { readFile: () => structured(gateCrit) });

  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(cap.stdout()).outcomes, [{ id: 'gate-check', kind: 'auto', outcome: 'met' }]);
});
