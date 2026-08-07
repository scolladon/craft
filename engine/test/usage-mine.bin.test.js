/**
 * Subprocess smoke tests for usage-mine bin shim.
 * Mirrors the pattern from init-emit.bin.test.js: spawnSync the shim from a
 * mkdtemp cwd so report.json / report.md are written to a throwaway dir.
 * Given/When/Then titles, AAA bodies, sut variable.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, cpSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dashedCwd } from '../src/observability/usage-mine-main.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'usage-mine.js');
// Telemetry fixture dir (under engine/test/fixtures/telemetry/) — used as --dir.
// Containment will reject it (not under ~/.claude/projects), which is correct advisory
// no-op behaviour; the bin still exits 0 and writes a no-op report to the cwd.
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry');
// The committed two-level sub-agent fixture tree — copied under a throwaway
// HOME's dashed-cwd slug so containment accepts it (see the HOME-scoped smoke below).
const PROJECTS_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry', 'projects', 'proj');

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function makeTmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'usage-mine-bin-'));
  tmpDirs.push(dir);
  return dir;
}

function runBin(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 15000,
  });
}

// ─── 9. Bin smoke — exits 0 and report.json + report.md exist ────────────────

test('Given a fixture dir passed to the usage-mine bin, when the bin runs, then it exits 0 and report.json and report.md exist inside the cwd repo', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();

  const result = sut(['--dir', FIXTURE_DIR], repoRoot);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must exist');
  assert.ok(existsSync(join(repoRoot, 'report.md')), 'report.md must exist');
});

test('Given no arguments to the usage-mine bin, when the bin runs, then it exits 0 (advisory no-op)', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();

  const result = sut([], repoRoot);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
});

test('Given an unknown --source value, when the bin runs, then it exits non-zero and stderr names the unknown source', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();

  const result = sut(['--source', 'bogus'], repoRoot);

  assert.notEqual(result.status, 0, `expected non-zero exit; stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('bogus'), `stderr must name the unknown source; got: ${result.stderr}`);
});

// ─── 10. No-leak — report.json contains no absolute paths, $HOME, username ───

test('Given the produced report.json, when scanned, then it contains no absolute path, no $HOME, no username', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();
  sut(['--dir', FIXTURE_DIR], repoRoot);

  const raw = readFileSync(join(repoRoot, 'report.json'), 'utf8');
  const home = process.env.HOME ?? '';
  const user = process.env.USER ?? process.env.LOGNAME ?? '';

  assert.ok(!raw.includes(FIXTURE_DIR), 'report must not contain the input dir path');
  if (home) assert.ok(!raw.includes(home), `report must not contain $HOME (${home})`);
  if (user) assert.ok(!raw.includes(`/${user}/`), `report must not contain username path segment /${user}/`);
});

test('Given the produced report.json, when parsed, then it has schemaVersion 1 and a runs array', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();
  sut(['--dir', FIXTURE_DIR], repoRoot);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));

  assert.equal(report.schemaVersion, 1);
  assert.ok(Array.isArray(report.runs));
});

// ─── 11. HOME-scoped zero-arg smoke — proves the dashed-cwd default end-to-end ──

test('Given a throwaway HOME carrying the committed sub-agent fixture under the repo\'s dashed-cwd slug, when the bin runs with zero arguments, then it exits 0, writes both reports, surfaces non-null sub-agent roles, and report.md carries a plausible dollar figure', () => {
  const repoRoot = makeTmpRepo();
  const tmpHome = mkdtempSync(join(tmpdir(), 'usage-mine-home-'));
  tmpDirs.push(tmpHome);

  // os.tmpdir() resolves through a symlink on this platform (/var -> /private/var)
  // and containByRealpath compares realpaths, while the child's process.cwd()
  // reports the resolved path — so the slug must derive from the realpath, not
  // from the raw mkdtemp return.
  const realRepoRoot = realpathSync(repoRoot);
  const projectDir = join(tmpHome, '.claude', 'projects', dashedCwd(realRepoRoot));
  mkdirSync(projectDir, { recursive: true });
  cpSync(PROJECTS_FIXTURE, projectDir, { recursive: true });

  // os.homedir() reads $HOME, and DEFAULT_PROJECTS_DIR is computed at module
  // load INSIDE the child process — so HOME must be set on the spawn's env,
  // not mutated on this process. Zero args + cwd: repoRoot is what makes this
  // the end-to-end proof of the advertised zero-argument front door.
  const result = spawnSync(process.execPath, [BIN], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, HOME: tmpHome },
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must exist');
  assert.ok(existsSync(join(repoRoot, 'report.md')), 'report.md must exist');
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const roles = report.runs.flatMap(r => r.groups).map(g => g.role);
  assert.ok(
    roles.some(r => r != null && r !== 'main-loop'),
    `sub-agent groups must carry a non-null, non-main-loop role; got: ${JSON.stringify(roles)}`,
  );
  const md = readFileSync(join(repoRoot, 'report.md'), 'utf8');
  assert.ok(/\$\d/.test(md), 'report.md must carry a dollar figure');
  assert.ok(!md.includes('$0.0000'), 'report.md must not render the render-time compensator regression');
});
