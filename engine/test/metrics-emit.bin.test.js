/**
 * Subprocess smoke tests for the metrics-emit bin shim.
 * Mirrors the pattern from usage-mine.bin.test.js: spawnSync the shim under a
 * throwaway HOME carrying the committed sub-agent fixture at its dashed-cwd slug.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, cpSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dashedCwd } from '../src/observability/usage-mine-main.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'metrics-emit.js');
const PROJECTS_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry', 'projects', 'proj');

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function makeTmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'metrics-emit-bin-'));
  tmpDirs.push(dir);
  return dir;
}

function runBin(args, cwd, env = process.env) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', timeout: 15000, env });
}

test('Given the fixture tree under a throwaway HOME, when the bin shim is spawned, then it exits 0 and prints the row it appended', () => {
  const repoRoot = makeTmpRepo();
  const tmpHome = mkdtempSync(join(tmpdir(), 'metrics-emit-home-'));
  tmpDirs.push(tmpHome);

  // Mirrors usage-mine.bin.test.js: the dashed-cwd slug must derive from the
  // realpath, since os.tmpdir() resolves through a symlink on this platform.
  const realRepoRoot = realpathSync(repoRoot);
  const projectDir = join(tmpHome, '.claude', 'projects', dashedCwd(realRepoRoot));
  mkdirSync(projectDir, { recursive: true });
  cpSync(PROJECTS_FIXTURE, projectDir, { recursive: true });

  const result = runBin(['--run', 'run-x'], repoRoot, { ...process.env, HOME: tmpHome });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('run-x design'), `expected the appended row on stdout; got: ${result.stdout}`);
});

test('Given no --run, when the bin is spawned, then it exits non-zero with a targeted stderr line', () => {
  const repoRoot = makeTmpRepo();

  const result = runBin([], repoRoot);

  assert.notEqual(result.status, 0, `expected non-zero exit; stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('--run'), `stderr must name the missing flag; got: ${result.stderr}`);
});
