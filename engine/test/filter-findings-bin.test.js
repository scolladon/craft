import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'filter-findings.js');
const normalizeBin = join(__dir, '..', 'bin', 'normalize-findings.js');

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'filterfind-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const FINDINGS_JSON = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' },
  { file: 'a.js', line: 30, severity: 'LOW', finding: 'out of scope' },
], null, 2) + '\n';

const EXPECTED = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' },
], null, 2) + '\n';

function runStdin(input, extraArgs) {
  return spawnSync(process.execPath, [bin, ...extraArgs], { input, encoding: 'utf8' });
}

// ─── stdin mode → exact scoped canonical bytes ───────────────────────────────

test('Given findings on stdin and a matching --scope, when filter-findings runs, then it prints the scoped canonical bytes and exits 0', () => {
  const sut = runStdin;

  const result = sut(FINDINGS_JSON, ['--scope', 'a.js:1-10']);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, EXPECTED);
});

// ─── file-path mode → exact scoped canonical bytes ───────────────────────────

test('Given a findings file path and a matching --scope, when filter-findings runs, then it prints the scoped canonical bytes and exits 0', () => {
  const path = writeTmp('findings.json', FINDINGS_JSON);
  const sut = spawnSync;

  const result = sut(process.execPath, [bin, path, '--scope', 'a.js:1-10'], { encoding: 'utf8' });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, EXPECTED);
});

// ─── nonexistent input path → exit 2, clean, no stack trace ────────────────

test('Given a nonexistent findings file path, when filter-findings runs, then it exits 2 with a clean message', () => {
  const sut = spawnSync;

  const result = sut(process.execPath, [bin, '/no/such/findings.json', '--scope', 'a.js:1-10'], { encoding: 'utf8' });

  assert.equal(result.status, 2, `expected clean exit 2; stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('filter-findings:'), `stderr should be the clean bin message; got: ${result.stderr}`);
  assert.equal(result.stdout, '');
});

// ─── end-to-end pipe: normalize-findings | filter-findings composes ────────

test('Given a per-line technique run piped through normalize-findings then filter-findings, when both run, then the scoped canonical bytes match filtering the normalized output directly', () => {
  const perLine = 'HIGH a.js:3 — x\nLOW a.js:30 — out of scope';
  const sut = spawnSync;

  const normalized = sut(process.execPath, [normalizeBin], { input: perLine, encoding: 'utf8' });
  assert.equal(normalized.status, 0, `normalize stderr: ${normalized.stderr}`);

  const result = sut(process.execPath, [bin, '--scope', 'a.js:1-10'], { input: normalized.stdout, encoding: 'utf8' });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, EXPECTED);
});
