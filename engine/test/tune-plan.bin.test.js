/**
 * Out-of-process smoke test for the tune-plan bin shim: a real fixture report +
 * base config on disk produce a patched manifest on stdout; a missing report
 * exits non-zero. Runs the shim via spawnSync in a mktemp throwaway dir.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'tune-plan.js');

const BASE_CONFIG = `---\nmodels:\n  planner: model-a\n---\n\n# Craft customization\n\nCustomize the craft workflow for this repo.\n`;

const REPORT = JSON.stringify({
  schemaVersion: 1,
  runs: [{
    run: 'r1', slug: 's',
    groups: [
      { phase: 'review', role: 'reviewer', model: 'model-a', tokens: {}, cost: { priced: 100 }, cacheEfficiency: 0 },
      { phase: 'review', role: 'reviewer', model: 'model-b', tokens: {}, cost: { priced: 20 }, cacheEfficiency: 0 },
    ],
    reviewCycles: [],
  }],
  recommendations: [{
    kind: 'model-routing', run: 'r1', phase: 'review', role: 'reviewer', model: 'model-a',
    detail: 'consider model-b', evidence: { currentModel: 'model-a', currentPricedCost: 100, candidateModel: 'model-b', projectedPricedCost: 20 },
  }],
});

function run(args) {
  return spawnSync('node', [BIN, ...args], { encoding: 'utf8' });
}

test('Given a fixture report and base config on disk, when the bin runs, then stdout carries a patched manifest and exits 0', () => {
  const sut = run;
  const dir = mkdtempSync(join(tmpdir(), 'tune-bin-'));
  const basePath = join(dir, 'craft-ci.md');
  const reportPath = join(dir, 'report.json');
  writeFileSync(basePath, BASE_CONFIG, 'utf8');
  writeFileSync(reportPath, REPORT, 'utf8');

  const result = sut([basePath, reportPath]);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hasPatch, true);
  assert.ok(out.patchedManifest.includes('reviewer: model-b'));
});

test('Given a missing report path, when the bin runs, then it exits non-zero', () => {
  const sut = run;
  const dir = mkdtempSync(join(tmpdir(), 'tune-bin-'));
  const basePath = join(dir, 'craft-ci.md');
  writeFileSync(basePath, BASE_CONFIG, 'utf8');

  const result = sut([basePath, join(dir, 'no-such-report.json')]);

  assert.notEqual(result.status, 0);
});
