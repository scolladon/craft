import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dir, '..', 'bin', 'contract-assemble.js');
const repoRoot = join(__dir, '..', '..');

function run(args) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

// ─── agent mode: production core markers present ──────────────────────────────

test('Given --descriptor-id design (agent mode), when contract-assemble runs, then stdout contains core markers', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'design']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.toLowerCase().includes('never commit on a red gate'), 'core marker "never commit on a red gate" must be present');
  assert.ok(result.stdout.includes('Blocker protocol'), 'core marker "Blocker protocol" must be present');
  assert.ok(result.stdout.includes('provenance'), 'core marker "provenance" must be present');
  assert.ok(result.stdout.includes('suppression'), 'core marker "suppression" must be present');
  assert.ok(result.stdout.includes('Bounded scope'), 'core marker "Bounded scope" must be present');
});

test('Given --descriptor-id design (agent mode), when contract-assemble runs, then stdout contains producer markers', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'design']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('template'), 'producer marker "template" must be present');
  assert.ok(result.stdout.includes('Decision-candidates'), 'producer marker "Decision-candidates" must be present');
  assert.ok(result.stdout.includes('convergence'), 'producer marker "convergence" must be present');
  assert.ok(result.stdout.includes('mktemp'), 'producer marker "mktemp" must be present');
});

// ─── inline mode: inline carve-out variant present ───────────────────────────

test('Given --descriptor-id design --inline, when contract-assemble runs, then stdout contains "the session model"', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'design', '--inline']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('the session model'), 'inline carve-out "the session model" must be present');
  assert.ok(
    !result.stdout.includes('the role model resolved'),
    'inline mode must NOT also emit the agent-mode model variant (replace, not append)',
  );
});

test('Given --descriptor-id design --inline, when contract-assemble runs, then stdout contains "the commit is the handoff (no agent context to lose)"', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'design', '--inline']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(
    result.stdout.includes('the commit is the handoff (no agent context to lose)'),
    'inline artifact-handoff carve-out must be present',
  );
  assert.ok(
    !result.stdout.includes('the agent commit is the handoff'),
    'inline mode must NOT also emit the agent-mode handoff variant (replace, not append)',
  );
});

// ─── contract:[] descriptor (workspace): core only, still exits 0 ────────────

test('Given --descriptor-id workspace (contract:[]), when contract-assemble runs, then exits 0 with core markers and no bundle text', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'workspace']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.toLowerCase().includes('never commit on a red gate'), 'core marker must be present for a contract:[] phase');
  assert.ok(result.stdout.includes('Bounded scope'), 'core marker "Bounded scope" must be present');
});

// ─── agent mode: agent carve-outs (not the inline variants) ──────────────────

test('Given --descriptor-id design (agent mode), when contract-assemble runs, then stdout contains agent-mode carve-outs', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'design']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(
    result.stdout.includes('the agent commit is the handoff'),
    'agent-mode artifact-handoff must be present',
  );
  assert.ok(
    result.stdout.includes('the role model resolved'),
    'agent-mode model-resolution must be present',
  );
});

// ─── unknown descriptor-id → exit 2 ──────────────────────────────────────────

test('Given --descriptor-id nonexistent-phase, when contract-assemble runs, then exits with code 2', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'nonexistent-phase']);

  assert.equal(result.status, 2, 'Unknown descriptor-id must exit with code 2');
  assert.ok(result.stderr.length > 0, 'stderr must contain an error message');
});

// ─── missing --descriptor-id → exit 2 ────────────────────────────────────────

test('Given no --descriptor-id argument, when contract-assemble runs, then exits with code 2', () => {
  const sut = run;

  const result = sut([]);

  assert.equal(result.status, 2, 'Missing --descriptor-id must exit with code 2');
});

// ─── a value-taking flag followed by another flag → exit 2 ───────────────────

test('Given --manifest immediately followed by another flag, when contract-assemble runs, then exits 2 (flag is not a valid value)', () => {
  const sut = run;

  const result = sut(['--manifest', '--descriptor-id', 'design']);

  assert.equal(result.status, 2, 'a flag consumed as a value must exit 2');
  assert.ok(result.stderr.includes('--manifest'), `stderr should name the offending flag; got: ${result.stderr}`);
});

// ─── review descriptor (harness-read bundle) ─────────────────────────────────

test('Given --descriptor-id review, when contract-assemble runs, then stdout contains harness-read markers', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'review']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('Read-only'), 'harness-read marker "Read-only" must be present');
  assert.ok(result.stdout.includes('findings'), 'harness-read marker "findings" must be present');
  assert.ok(result.stdout.includes('Zero findings'), 'harness-read marker "Zero findings" must be present');
});
