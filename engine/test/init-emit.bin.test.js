/**
 * Subprocess (bin-level) tests for init-emit bin.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'init-emit.js');
const lintBin = join(__dir, '..', 'bin', 'manifest-lint.js');

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'init-emit-'));
  tmpDirs.push(dir);
  return dir;
}

function writeAnswers(dir, answers) {
  const path = join(dir, 'answers.json');
  writeFileSync(path, JSON.stringify(answers));
  return path;
}

function run(answersPath, outPath) {
  const args = [answersPath, outPath].filter(Boolean);
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

// ─── valid answers → manifest-lint exits 0 ───────────────────────────────────

test('Given answers JSON, when init-emit bin writes manifest and manifest-lint runs on it, then manifest-lint exits 0', () => {
  const sut = run;
  const dir = makeTmpDir();
  const dotClaudeDir = join(dir, '.claude');
  mkdirSync(dotClaudeDir, { recursive: true });
  const outPath = join(dotClaudeDir, 'craft-ci.md');
  const answersPath = writeAnswers(dir, { name: 'ci', profile: 'lean' });

  sut(answersPath, outPath);

  const lintResult = spawnSync(process.execPath, [lintBin, outPath], { encoding: 'utf8' });
  assert.equal(lintResult.status, 0, `lint stderr: ${lintResult.stderr}`);
  assert.ok(lintResult.stdout.includes('valid.'), `lint stdout: ${lintResult.stdout}`);
});

// ─── temp-lint-no-move: a lint-failing emit never overwrites the prior file ───

test('Given a prior valid manifest, when a lint-failing manifest is emitted to a temp sibling, then the temp fails lint and the prior file stays byte-for-byte intact', () => {
  const dir = makeTmpDir();
  const dotClaudeDir = join(dir, '.claude');
  mkdirSync(dotClaudeDir, { recursive: true });
  const finalPath = join(dotClaudeDir, 'craft-foo.md');
  const goodContent = '---\npipeline:\n  profile: lean\n---\n\nGood manifest.\n';
  writeFileSync(finalPath, goodContent);
  // A conflicting policy (push in both verdicts) emits a valid-shape but lint-failing manifest.
  const answersPath = writeAnswers(dir, { name: 'foo', policy: { always: ['push'], never: ['push'] } });
  const tmpPath = join(dotClaudeDir, '.craft-foo.tmp');

  run(answersPath, tmpPath);
  const lint = spawnSync(process.execPath, [lintBin, tmpPath], { encoding: 'utf8' });

  // The temp lints non-zero, so the generator does NOT move it — the prior file is untouched.
  assert.notEqual(lint.status, 0, `temp manifest must fail lint; stdout: ${lint.stdout}`);
  assert.equal(readFileSync(finalPath, 'utf8'), goodContent, 'prior manifest must be byte-for-byte intact (no move on lint failure)');
});

// ─── direct overwrite: re-run updates the manifest ──────────────────────────

test('Given an existing named manifest, when init-emit bin runs again with new answers, then the file is updated', () => {
  const sut = run;
  const dir = makeTmpDir();
  const dotClaudeDir = join(dir, '.claude');
  mkdirSync(dotClaudeDir, { recursive: true });
  const outPath = join(dotClaudeDir, 'craft-ci.md');
  const firstAnswersPath = writeAnswers(dir, { name: 'ci', profile: 'lean' });
  sut(firstAnswersPath, outPath);
  const firstContent = readFileSync(outPath, 'utf8');

  const secondAnswersPath = writeAnswers(dir, { name: 'ci', profile: 'solo' });
  sut(secondAnswersPath, outPath);
  const secondContent = readFileSync(outPath, 'utf8');

  assert.notEqual(firstContent, secondContent, 'second run must update the manifest');
  assert.ok(secondContent.includes('solo'), 'updated manifest must contain new profile');
});

// ─── exit 0 + file created for valid answers ────────────────────────────────

test('Given valid answers JSON, when init-emit bin runs, then it exits 0 and the output file exists', () => {
  const sut = run;
  const dir = makeTmpDir();
  const outPath = join(dir, 'craft-ci.md');
  const answersPath = writeAnswers(dir, { name: 'ci' });

  const result = sut(answersPath, outPath);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(outPath), 'output file must exist');
});

// ─── malformed JSON → non-zero + stderr diagnostic ──────────────────────────

test('Given init-emit bin malformed answers JSON, when it runs, then it exits non-zero and writes a diagnostic to stderr', () => {
  const sut = run;
  const dir = makeTmpDir();
  const badJsonPath = join(dir, 'bad.json');
  writeFileSync(badJsonPath, 'this is not json {{{');
  const outPath = join(dir, 'out.md');

  const result = sut(badJsonPath, outPath);

  assert.notEqual(result.status, 0, 'must exit non-zero on malformed JSON');
  assert.ok(result.stderr.length > 0, 'must write a diagnostic to stderr');
});

// ─── no out-path → non-zero + usage diagnostic ───────────────────────────────

test('Given init-emit bin no out-path argument, when it runs, then it exits non-zero with a usage diagnostic', () => {
  const sut = (answersPath) => spawnSync(process.execPath, [bin, answersPath], { encoding: 'utf8' });
  const dir = makeTmpDir();
  const answersPath = writeAnswers(dir, { name: 'ci' });

  const result = sut(answersPath);

  assert.notEqual(result.status, 0, 'must exit non-zero when out-path is missing');
  assert.ok(result.stderr.length > 0, 'must write a usage diagnostic to stderr');
});

// ─── non-object answers JSON → non-zero + diagnostic ─────────────────────────

test('Given init-emit bin answers JSON that is not an object (null), when it runs, then it exits non-zero with an object diagnostic', () => {
  const sut = run;
  const dir = makeTmpDir();
  const nullJsonPath = join(dir, 'null.json');
  writeFileSync(nullJsonPath, 'null');
  const outPath = join(dir, 'out.md');

  const result = sut(nullJsonPath, outPath);

  assert.notEqual(result.status, 0, 'must exit non-zero on non-object answers');
  assert.ok(result.stderr.includes('object'), `stderr should mention object: ${result.stderr}`);
});

// ─── answers via stdin (empty answers-path arg) ──────────────────────────────

test('Given answers piped via stdin and an empty answers-path arg, when init-emit bin runs, then it writes the manifest', () => {
  const dir = makeTmpDir();
  const outPath = join(dir, 'craft-ci.md');

  const result = spawnSync(process.execPath, [bin, '', outPath], {
    encoding: 'utf8',
    input: JSON.stringify({ name: 'ci', profile: 'lean' }),
  });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(outPath), 'output file must exist when answers come from stdin');
});
