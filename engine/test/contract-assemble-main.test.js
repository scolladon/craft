import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/contract-assemble-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const manifestsDir = join(__dir, 'fixtures', 'manifests');
const contractsDir = join(__dir, '..', '..', 'contracts');

const tmpDirs = [];
function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'craft-ca-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => { for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true }); });

// ─── agent mode: core markers present ────────────────────────────────────────

test('Given --descriptor-id design (agent mode), when main runs, then stdout contains core markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker "never commit on a red gate" must be present');
  assert.ok(io.stdout.joined().includes('Blocker protocol'), 'core marker "Blocker protocol" must be present');
  assert.ok(io.stdout.joined().includes('provenance'), 'core marker "provenance" must be present');
  assert.ok(io.stdout.joined().includes('suppression'), 'core marker "suppression" must be present');
  assert.ok(io.stdout.joined().includes('Bounded scope'), 'core marker "Bounded scope" must be present');
});

// ─── agent mode: producer markers present ────────────────────────────────────

test('Given --descriptor-id design (agent mode), when main runs, then stdout contains producer markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('template'), 'producer marker "template" must be present');
  assert.ok(io.stdout.joined().includes('Decision-candidates'), 'producer marker "Decision-candidates" must be present');
  assert.ok(io.stdout.joined().includes('convergence'), 'producer marker "convergence" must be present');
  assert.ok(io.stdout.joined().includes('mktemp'), 'producer marker "mktemp" must be present');
});

// ─── agent mode: agent carve-outs (not the inline variants) ──────────────────

test('Given --descriptor-id design (agent mode), when main runs, then stdout contains agent-mode carve-outs', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes('the agent commit is the handoff'),
    'agent-mode artifact-handoff must be present',
  );
  assert.ok(
    io.stdout.joined().includes('the role model resolved'),
    'agent-mode model-resolution must be present',
  );
});

// ─── inline mode: inline carve-out variant present ───────────────────────────

test('Given --descriptor-id design --inline, when main runs, then stdout contains "the session model"', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', '--inline'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('the session model'), 'inline carve-out "the session model" must be present');
  assert.ok(
    !io.stdout.joined().includes('the role model resolved'),
    'inline mode must NOT also emit the agent-mode model variant',
  );
});

test('Given --descriptor-id design --inline, when main runs, then stdout contains inline commit handoff', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', '--inline'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes('the commit is the handoff (no agent context to lose)'),
    'inline artifact-handoff carve-out must be present',
  );
  assert.ok(
    !io.stdout.joined().includes('the agent commit is the handoff'),
    'inline mode must NOT also emit the agent-mode handoff variant',
  );
});

// ─── contract:[] descriptor (workspace): core only, still exits 0 ────────────

test('Given --descriptor-id workspace (contract:[]), when main runs, then exits 0 with core markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'workspace'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present for a contract:[] phase');
  assert.ok(io.stdout.joined().includes('Bounded scope'), 'core marker "Bounded scope" must be present');
});

// ─── unknown descriptor-id → exit 2 ──────────────────────────────────────────

test('Given --descriptor-id nonexistent-phase, when main runs, then returns 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'nonexistent-phase'], io);

  assert.equal(result, 2, 'Unknown descriptor-id must return 2');
  assert.ok(io.stderr.joined().length > 0, 'stderr must contain an error message');
});

// ─── missing --descriptor-id → exit 2 ────────────────────────────────────────

test('Given no --descriptor-id argument, when main runs, then returns 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 2, 'Missing --descriptor-id must return 2');
  assert.match(io.stderr.joined(), /Usage: contract-assemble/);
});

// ─── flag-as-value: --manifest followed by another flag → exit 2 ─────────────

test('Given --manifest immediately followed by another flag, when main runs, then returns 2 naming --manifest', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--manifest', '--descriptor-id', 'design'], io);

  assert.equal(result, 2, 'a flag consumed as a value must return 2');
  assert.ok(io.stderr.joined().includes('--manifest'), `stderr should name the offending flag; got: ${io.stderr.joined()}`);
});

// ─── fenced manifest via --manifest: frontmatter-only parse ──────────────────

test('Given --descriptor-id design --manifest with-body.md, when main runs, then exits 0 with core markers', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut(['--descriptor-id', 'design', '--manifest', manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present');
});

// ─── manifest with context sentinels ─────────────────────────────────────────

test('Given --descriptor-id design --manifest with-context.md, when main runs, then context sentinels are injected and body sentinel absent', () => {
  const sut = main;
  const io = makeCaptureIo();
  const manifestPath = join(manifestsDir, 'with-context.md');

  const result = sut(['--descriptor-id', 'design', '--manifest', manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('GLOBAL_CONTEXT_SENTINEL'), 'global context sentinel must be injected');
  assert.ok(io.stdout.joined().includes('DESIGN_CONTEXT_SENTINEL'), 'per-phase context sentinel must be injected for design descriptor');
  assert.ok(!io.stdout.joined().includes('BODY_SENTINEL'), 'body sentinel must NOT appear');
});

// ─── requirements descriptor (producer bundle) ───────────────────────────────

test('Given --descriptor-id requirements, when main runs, then exits 0 with producer markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'requirements'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('Decision-candidates'), 'producer marker "Decision-candidates" must be present');
  assert.ok(io.stdout.joined().includes('Fill the named template'), 'producer marker "Fill the named template" must be present');
  assert.ok(!io.stdout.joined().includes('survivors or violations'), 'harness-exec marker must NOT leak into the producer bundle');
});

// ─── architecture descriptor (harness-exec bundle) ───────────────────────────

test('Given --descriptor-id architecture, when main runs, then exits 0 with harness-exec markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'architecture'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('survivors or violations'), 'harness-exec marker "survivors or violations" must be present');
  assert.ok(io.stdout.joined().includes('Never weaken a test to kill a mutant or clear a violation'), 'harness-exec marker must be present');
  assert.ok(!io.stdout.joined().includes('Decision-candidates'), 'producer marker must NOT leak into the harness-exec bundle');
});

// ─── review descriptor (harness-read bundle) ─────────────────────────────────

test('Given --descriptor-id review, when main runs, then stdout contains harness-read markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'review'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('Read-only'), 'harness-read marker "Read-only" must be present');
  assert.ok(io.stdout.joined().includes('findings'), 'harness-read marker "findings" must be present');
  assert.ok(io.stdout.joined().includes('Zero findings'), 'harness-read marker "Zero findings" must be present');
});

// ─── --contracts-dir positive branch: explicit real dir resolves ─────────────

test('Given --contracts-dir pointing at the real contracts dir, when main runs, then it exits 0 with core markers', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['--descriptor-id', 'design', '--contracts-dir', contractsDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().toLowerCase().includes('never commit on a red gate'), 'core marker must be present');
});

// ─── --contracts-dir missing a fragment: loadFragments failure catch ─────────

test('Given --contracts-dir pointing at a dir missing fragments, when main runs, then it returns 2 and reports a fragment load failure', () => {
  const sut = main;
  const io = makeCaptureIo();
  const emptyDir = makeTmpDir();

  const result = sut(['--descriptor-id', 'design', '--contracts-dir', emptyDir], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to load contract fragments/);
});

// ─── malformed --manifest: manifest parse-failure catch ──────────────────────

test('Given a malformed --manifest, when main runs, then it returns 2 and reports a manifest parse failure', () => {
  const sut = main;
  const io = makeCaptureIo();
  const badManifest = join(makeTmpDir(), 'bad.md');
  writeFileSync(badManifest, '---\nkey:\n\tbroken\n---\nbody\n');

  const result = sut(['--descriptor-id', 'design', '--manifest', badManifest], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /failed to parse manifest/);
});
