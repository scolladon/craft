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

// ─── fenced manifest via --manifest: frontmatter-only parse ──────────────────

test('Given --descriptor-id design --manifest with-body.md (fenced), when contract-assemble runs, then exits 0 with core markers', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'design', '--manifest', 'engine/test/fixtures/manifests/with-body.md']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.toLowerCase().includes('never commit on a red gate'), 'core marker "never commit on a red gate" must be present');
});

test('Given --descriptor-id design --manifest with-context.md, when contract-assemble runs, then context sentinels are injected and body sentinel is absent', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'design', '--manifest', 'engine/test/fixtures/manifests/with-context.md']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('GLOBAL_CONTEXT_SENTINEL'), 'global context sentinel must be injected');
  assert.ok(result.stdout.includes('DESIGN_CONTEXT_SENTINEL'), 'per-phase context sentinel must be injected for design descriptor');
  assert.ok(!result.stdout.includes('BODY_SENTINEL'), 'body sentinel must NOT appear — body never reaches the parser');
});

// ─── requirements descriptor (producer bundle) ───────────────────────────────

test('Given --descriptor-id requirements, when contract-assemble runs, then exits 0 with producer markers', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'requirements']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('Decision-candidates'), 'producer marker "Decision-candidates" must be present');
  assert.ok(result.stdout.includes('Fill the named template'), 'producer marker "Fill the named template" must be present');
  assert.ok(!result.stdout.includes('triages findings'), 'harness-exec marker must NOT leak into the producer bundle');
});

// ─── architecture descriptor (harness-exec bundle) ───────────────────────────

test('Given --descriptor-id architecture, when contract-assemble runs, then exits 0 with harness-exec markers', () => {
  const sut = run;

  const result = sut(['--descriptor-id', 'architecture']);

  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('triages findings'), 'harness-exec marker "triages findings" must be present');
  assert.ok(result.stdout.includes('Never weaken a test or rule to clear a finding'), 'harness-exec marker "Never weaken a test or rule to clear a finding" must be present');
  assert.ok(!result.stdout.includes('Decision-candidates'), 'producer marker must NOT leak into the harness-exec bundle');
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

// ─── --descriptor-json via stdin ("-"): source==='-' guard ───────────────────
// Kills: Survived ConditionalExpression (text = false) and StringLiteral (source === "")
// at contract-assemble-main.js:92, plus NoCoverage at :93 ('/dev/stdin' and 'utf8').
// spawnSync with `input` injects the JSON on stdin so readFileSync('/dev/stdin', 'utf8') reads it.

function runWithStdin(args, stdinContent) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: stdinContent,
  });
}

test('Given --descriptor-json - (stdin source) with bench descriptor JSON on stdin, when contract-assemble runs, then exits 0 and stdout contains core markers', () => {
  const sut = runWithStdin;
  const descriptors = JSON.stringify([
    { id: 'bench', archetype: 'harness', enabled: true, contract: ['harness-exec'], consumes: [], produces: [], self_supply: [], execution: 'agent' },
  ]);

  const result = sut(['--descriptor-id', 'bench', '--descriptor-json', '-'], descriptors);

  assert.equal(result.status, 0, `Expected exit 0; stderr: ${result.stderr}`);
  assert.ok(result.stdout.toLowerCase().includes('never commit on a red gate'), 'core marker must be present when reading from stdin');
});

test('Given --descriptor-json - (stdin source) with a single-object (non-array) descriptor on stdin, when contract-assemble runs, then exits 0 (object normalised to array)', () => {
  const sut = runWithStdin;
  // Single object, not an array — exercises the Array.isArray branch normalisation
  const descriptor = JSON.stringify(
    { id: 'bench', archetype: 'harness', enabled: true, contract: ['harness-exec'], consumes: [], produces: [], self_supply: [], execution: 'agent' },
  );

  const result = sut(['--descriptor-id', 'bench', '--descriptor-json', '-'], descriptor);

  assert.equal(result.status, 0, `Expected exit 0 when normalising single object to array; stderr: ${result.stderr}`);
  assert.ok(result.stdout.toLowerCase().includes('never commit on a red gate'), 'core marker must be present after normalisation');
});
