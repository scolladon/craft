'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, readdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'governing-corpus.sh');
const ADR_DIR_RELATIVE = 'docs/contributing/adr';

test('Given the repo\'s ADR directory, when governing-corpus.sh runs, then it emits one line per .md file, LC_ALL=C-sorted', () => {
  const out = execFileSync('bash', [SCRIPT, ADR_DIR_RELATIVE], { cwd: ROOT, encoding: 'utf8' });

  const lines = out.split('\n').filter(Boolean);
  const expected = readdirSync(path.join(ROOT, ADR_DIR_RELATIVE))
    .filter(name => name.endsWith('.md'))
    .map(name => `${ADR_DIR_RELATIVE}/${name}`);

  assert.strictEqual(lines.length, expected.length, 'expected one line per .md file (independent readdirSync count)');
  assert.deepStrictEqual(new Set(lines), new Set(expected));
});

test('Given the governing corpus output, when read as LC_ALL=C-sorted lines, then it matches sort -c', () => {
  const out = execFileSync('bash', [SCRIPT, ADR_DIR_RELATIVE], { cwd: ROOT, encoding: 'utf8' });

  const result = spawnSync('sort', ['-c'], {
    input: out,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });

  assert.strictEqual(result.status, 0, `expected LC_ALL=C-sorted output; sort -c stderr: ${result.stderr}`);
});

test('Given a directory holding no markdown, when governing-corpus.sh runs, then it exits non-zero with a zero-record stderr message', () => {
  const emptyDir = mkdtempSync(path.join(os.tmpdir(), 'governing-corpus-empty-'));

  try {
    const result = spawnSync('bash', [SCRIPT, emptyDir], { cwd: ROOT, encoding: 'utf8' });

    assert.notStrictEqual(result.status, 0, 'expected non-zero exit on zero-file enumeration');
    assert.ok(
      (result.stderr || '').includes('enumerated zero governing pages'),
      `expected the zero-record stderr message; got: ${result.stderr}`
    );
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }
});
