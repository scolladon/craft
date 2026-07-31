'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'sync-adapter-agents.sh');

const SHARED_ALPHA_BODY = 'Alpha body line one.\nAlpha body line two.\n';
const SHARED_BETA_BODY = 'Beta body line one.\n';

function mirrorPath(root, adapter, role) {
  return path.join(root, 'adapters', adapter, 'agents', `craft-${role}.md`);
}

function writeMirror(root, adapter, role, content) {
  const target = mirrorPath(root, adapter, role);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

// Builds a fully in-sync fixture tree:
//  - adapter-mixed-sep: fenced mirrors, replicating the measured copilot
//    anomaly of a DIFFERENT separator per role within the SAME adapter
//    (alpha: 0 blank lines, beta: 1 blank line after the closing fence).
//  - adapter-body-only: fence-less mirrors (the aider shape).
//  - no-agents-dir: an adapter directory with no agents/ subdirectory
//    (the pi shape) — must never be scanned or reported.
function buildCleanFixtureTree(root) {
  const agentsDir = path.join(root, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, 'alpha.md'), `---\nname: alpha\n---\n\n${SHARED_ALPHA_BODY}`);
  fs.writeFileSync(path.join(agentsDir, 'beta.md'), `---\nname: beta\n---\n\n${SHARED_BETA_BODY}`);

  writeMirror(root, 'adapter-mixed-sep', 'alpha', `---\nname: craft-alpha\n---\n${SHARED_ALPHA_BODY}`);
  writeMirror(root, 'adapter-mixed-sep', 'beta', `---\nname: craft-beta\n---\n\n${SHARED_BETA_BODY}`);
  writeMirror(root, 'adapter-body-only', 'alpha', SHARED_ALPHA_BODY);
  writeMirror(root, 'adapter-body-only', 'beta', SHARED_BETA_BODY);

  fs.mkdirSync(path.join(root, 'adapters', 'no-agents-dir'), { recursive: true });
  fs.writeFileSync(path.join(root, 'adapters', 'no-agents-dir', 'README.md'), 'no agents here\n');
}

// Same as the clean tree, plus one adapter with a genuinely absent mirror
// (adapter-missing/beta) — the rest of the tree stays in sync so a "missing"
// report can be tested in isolation from a "drifted" report.
function buildMissingFixtureTree(root) {
  buildCleanFixtureTree(root);
  writeMirror(root, 'adapter-missing', 'alpha', `---\nname: craft-alpha\n---\n\n${SHARED_ALPHA_BODY}`);
  // adapter-missing/beta intentionally absent.
}

function withFixture(builder, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-adapter-agents-'));
  builder(root);
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runSync(args) {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

test('Given a fully in-sync fixture tree, when --check runs, then it exits 0 and prints nothing', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Act
    const result = runSync(['--check', '--root', root]);

    // Assert
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
  });
});

test('Given no mode flag at all, when the tool runs against a synced tree, then it defaults to --check (read-only, exit 0, silent)', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Arrange
    const before = fs.readFileSync(mirrorPath(root, 'adapter-mixed-sep', 'alpha'), 'utf8');

    // Act
    const result = runSync(['--root', root]);

    // Assert
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
    const after = fs.readFileSync(mirrorPath(root, 'adapter-mixed-sep', 'alpha'), 'utf8');
    assert.strictEqual(after, before, 'expected the default mode to write nothing');
  });
});

test('Given a mirror whose body has drifted, when --check runs, then it exits non-zero and names exactly that mirror', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Arrange
    fs.writeFileSync(mirrorPath(root, 'adapter-mixed-sep', 'alpha'), '---\nname: craft-alpha\n---\nTampered body.\n');

    // Act
    const result = runSync(['--check', '--root', root]);

    // Assert
    assert.notStrictEqual(result.status, 0);
    assert.strictEqual(result.stderr.trim(), 'sync-adapter-agents: adapter-mixed-sep/alpha: drifted');
  });
});

test('Given a mirror using a zero-blank-line separator, when its body drifts and --write runs, then the body is restored and the zero-blank-line separator is preserved', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Arrange
    const target = mirrorPath(root, 'adapter-mixed-sep', 'alpha');
    const pristine = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, '---\nname: craft-alpha\n---\nTampered body.\n');

    // Act
    runSync(['--write', '--root', root]);

    // Assert
    const result = fs.readFileSync(target, 'utf8');
    assert.strictEqual(result, pristine);
    assert.doesNotMatch(result, /^---\n[^\n]*\n---\n\n/, 'expected the zero-blank-line separator, not one blank line');
  });
});

test('Given a mirror using a one-blank-line separator, when its body drifts and --write runs, then the body is restored and the one-blank-line separator is preserved', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Arrange
    const target = mirrorPath(root, 'adapter-mixed-sep', 'beta');
    const pristine = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, '---\nname: craft-beta\n---\n\nTampered body.\n');

    // Act
    runSync(['--write', '--root', root]);

    // Assert
    const result = fs.readFileSync(target, 'utf8');
    assert.strictEqual(result, pristine);
    assert.match(result, /^---\n[^\n]*\n---\n\n/, 'expected the one-blank-line separator to survive the write');
  });
});

test('Given an already-synced tree, when --write runs a second time, then it changes nothing (idempotence)', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Arrange
    const target = mirrorPath(root, 'adapter-mixed-sep', 'beta');
    fs.writeFileSync(target, '---\nname: craft-beta\n---\n\nTampered body.\n');
    runSync(['--write', '--root', root]);
    const afterFirstWrite = fs.readFileSync(target, 'utf8');

    // Act
    runSync(['--write', '--root', root]);

    // Assert
    const afterSecondWrite = fs.readFileSync(target, 'utf8');
    assert.strictEqual(afterSecondWrite, afterFirstWrite);
  });
});

test('Given a body-only (aider-shaped) mirror whose body has drifted, when --write runs, then the result starts with neither a frontmatter fence nor a blank line', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Arrange
    const target = mirrorPath(root, 'adapter-body-only', 'alpha');
    fs.writeFileSync(target, 'Tampered body-only content.\n');

    // Act
    runSync(['--write', '--root', root]);

    // Assert
    const result = fs.readFileSync(target, 'utf8');
    assert.strictEqual(result, SHARED_ALPHA_BODY);
    assert.doesNotMatch(result, /^---/);
    assert.doesNotMatch(result, /^\n/);
  });
});

test('Given a role present in agents/ but absent from a mirror directory, when --check runs, then it is reported as missing, not created', () => {
  withFixture(buildMissingFixtureTree, (root) => {
    // Act
    const result = runSync(['--check', '--root', root]);

    // Assert
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /sync-adapter-agents: adapter-missing\/beta: missing/);
    assert.strictEqual(fs.existsSync(mirrorPath(root, 'adapter-missing', 'beta')), false);
  });
});

test('Given a role present in agents/ but absent from a mirror directory, when --write runs, then it is still reported as missing and still not created', () => {
  withFixture(buildMissingFixtureTree, (root) => {
    // Act
    const result = runSync(['--write', '--root', root]);

    // Assert
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /sync-adapter-agents: adapter-missing\/beta: missing/);
    assert.strictEqual(fs.existsSync(mirrorPath(root, 'adapter-missing', 'beta')), false);
  });
});

test('Given an adapter directory with no agents/ subdirectory, when --check runs, then it is never reported as drifted or missing', () => {
  withFixture(buildMissingFixtureTree, (root) => {
    // Act
    const result = runSync(['--check', '--root', root]);

    // Assert
    assert.ok(result.stderr.length > 0, 'expected the missing-fixture stderr to be non-empty');
    assert.doesNotMatch(result.stderr, /no-agents-dir/);
  });
});

test('Given an unrecognized flag, when the tool runs, then it exits 2 with a usage error on stderr', () => {
  withFixture(buildCleanFixtureTree, (root) => {
    // Act
    const result = runSync(['--bogus', '--root', root]);

    // Assert
    assert.strictEqual(result.status, 2);
    assert.match(result.stderr, /unknown flag/);
  });
});

test('Given scripts/ci.sh, when its content is read, then it wires --check into the lint chain', () => {
  // Arrange
  const sut = fs.readFileSync(path.join(ROOT, 'scripts', 'ci.sh'), 'utf8');

  // Act
  const result = sut.includes('bash scripts/sync-adapter-agents.sh --check');

  // Assert
  assert.strictEqual(result, true);
});
