import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'lesson-lint.js');
const EM_DASH = '—';

const VALID_LESSON = [
  '---',
  "subjects: ['engine/src/**']",
  'phases: [validation]',
  'kind: trap',
  'trigger: running a scoped mutation',
  "evidence: ['README.md']",
  'source: { run: some-run, phase: design, date: 2026-10-19 }',
  'status: active',
  'last-verified: 2026-10-19',
  '---',
  '',
  `# 001 ${EM_DASH} A title`,
  '',
  '## Context',
  'Why.',
  '',
  '## Lesson',
  'What.',
  '',
  '## How to apply',
  'Do the thing.',
  '',
  '## Evidence',
  'Where.',
  '',
].join('\n');

function runWithLesson(content) {
  const root = mkdtempSync(join(tmpdir(), 'lessonlint-bin-'));
  try {
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, 'README.md'), '# readme\n');
    mkdirSync(join(root, 'lessons'));
    writeFileSync(join(root, 'lessons', '001-first.md'), content);
    return spawnSync(process.execPath, [BIN, 'lessons'], { encoding: 'utf8', cwd: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Given a valid corpus, when the lesson-lint bin is spawned, then it exits 0', () => {
  const sut = runWithLesson;

  const result = sut(VALID_LESSON);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('craft-lessons: OK'));
});

test('Given an invalid corpus, when the lesson-lint bin is spawned, then it exits 2', () => {
  const sut = runWithLesson;

  const result = sut('not a lesson\n');

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('craft-lessons: INVALID corpus:'));
});

test('Given the bin imported as a module, when loaded, then main does not run', () => {
  const sut = pathToFileURL(BIN).href;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(sut)})`], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
