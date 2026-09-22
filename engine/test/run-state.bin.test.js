/**
 * Child-process smoke tests for the run-state bin: real argv, real stdin,
 * real exit codes. Given/When/Then titles, Arrange-Act-Assert bodies, sut
 * variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..');
const binPath = join(__dir, '..', 'bin', 'run-state.js');
const pipelineResolveBinPath = join(__dir, '..', 'bin', 'pipeline-resolve.js');
const pipelinePath = join(repoRoot, 'pipeline', 'default.yml');
const enableArchitecturePath = join(__dir, 'fixtures', 'manifests', 'enable-architecture.yml');
const midValidationLedgerPath = join(__dir, 'fixtures', 'run-ledger', 'mid-validation.md');

function resolvePipeline() {
  return spawnSync(process.execPath, [pipelineResolveBinPath, pipelinePath, enableArchitecturePath], { encoding: 'utf8' });
}

function runRunState(args, input) {
  return spawnSync(process.execPath, [binPath, ...args], { encoding: 'utf8', input });
}

// ─── survival acceptance: real pipeline-resolve output feeds the bin ────────

test('Given pipeline-resolve real output for default.yml with enable-architecture.yml piped into the run-state bin with mid-validation.md, when the bin runs, then it exits 0 with next propose, awaitingHarnesses validation, and one background entry', () => {
  const sut = runRunState;
  const resolved = resolvePipeline();
  assert.equal(resolved.status, 0, `pipeline-resolve stderr: ${resolved.stderr}`);

  const result = sut([midValidationLedgerPath, '--run', 'demo'], resolved.stdout);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const state = JSON.parse(result.stdout);
  assert.equal(state.next, 'propose');
  assert.deepEqual(state.awaitingHarnesses, ['validation']);
  assert.equal(state.background.length, 1);
});

// ─── missing ledger → exit 2 ──────────────────────────────────────────────

test('Given a missing ledger, when the bin runs, then it exits 2', () => {
  const sut = runRunState;
  const resolved = resolvePipeline();
  assert.equal(resolved.status, 0, `pipeline-resolve stderr: ${resolved.stderr}`);

  const result = sut(['/no/such/ledger.md', '--run', 'demo'], resolved.stdout);

  assert.equal(result.status, 2);
});
