'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'governing-corpus.sh');
const ADR_DIR_RELATIVE = 'docs/contributing/adr';

test('Given the repo\'s ADR directory, when governing-corpus.sh runs, then it emits one line per FENCED .md file, LC_ALL=C-sorted', () => {
  const out = execFileSync('bash', [SCRIPT, ADR_DIR_RELATIVE], { cwd: ROOT, encoding: 'utf8' });

  const lines = out.split('\n').filter(Boolean);
  // readdirSync + an independent first-line read, not the same find the script
  // runs — a real second opinion on both the enumeration and the fence filter.
  const allMarkdown = readdirSync(path.join(ROOT, ADR_DIR_RELATIVE)).filter(name => name.endsWith('.md'));
  const expected = allMarkdown
    .filter(name => readFileSync(path.join(ROOT, ADR_DIR_RELATIVE, name), 'utf8').split('\n')[0] === '---')
    .map(name => `${ADR_DIR_RELATIVE}/${name}`);

  assert.strictEqual(lines.length, expected.length, 'expected one line per fenced .md file (independent readdirSync count)');
  assert.deepStrictEqual(new Set(lines), new Set(expected));
  assert.ok(
    expected.length < allMarkdown.length,
    'fixture precondition: the corpus must hold unfenced ADRs, or the filter proves nothing'
  );
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

test('Given a corpus whose records carry no fence, when governing-corpus.sh runs, then it exits 0 with an empty-lane note', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'governing-corpus-unfenced-'));

  try {
    writeFileSync(path.join(dir, '001-legacy.md'), '# 001 — Legacy\n');
    const result = spawnSync('bash', [SCRIPT, dir], { cwd: ROOT, encoding: 'utf8' });

    // An empty governing lane is the ordinary pre-adoption state, NOT a
    // misconfiguration — the opposite of living-corpus.sh's zero-page rule.
    assert.strictEqual(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
    assert.strictEqual(result.stdout, '', `expected no paths; got: ${result.stdout}`);
    assert.ok(
      (result.stderr || '').includes('no decision record carries a frontmatter fence yet'),
      `expected the empty-lane note; got: ${result.stderr}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given an argument that is not a directory, when governing-corpus.sh runs, then it exits non-zero without letting find read it as a predicate', () => {
  const result = spawnSync('bash', [SCRIPT, '-delete'], { cwd: ROOT, encoding: 'utf8' });

  assert.notStrictEqual(result.status, 0, 'expected non-zero exit');
  assert.ok(
    (result.stderr || '').includes('not a directory'),
    `expected the not-a-directory diagnostic; got: ${result.stderr}`
  );
});

test('Given a fenced record whose filename contains a newline, when governing-corpus.sh runs, then it is still enumerated', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'governing-corpus-newline-'));

  try {
    writeFileSync(path.join(dir, '001-ok.md'), '---\ny: 1\n---\n');
    writeFileSync(path.join(dir, '00\n2-weird.md'), '---\nz: 1\n---\n');
    const result = spawnSync('bash', [SCRIPT, dir], { cwd: ROOT, encoding: 'utf8' });

    // Splitting find's output on newlines would fragment the weird name into
    // two entries that both fail the -f test and vanish with no diagnostic.
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('2-weird.md'), `expected the newline-named record; got: ${JSON.stringify(result.stdout)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a symlink and a non-regular entry among the records, when governing-corpus.sh runs, then neither is enumerated', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'governing-corpus-symlink-'));

  try {
    writeFileSync(path.join(dir, '001-ok.md'), '---\ny: 1\n---\n');
    writeFileSync(path.join(dir, 'outside.md'), '---\nz: 1\n---\n');
    symlinkSync(path.join(dir, 'outside.md'), path.join(dir, '002-link.md'));
    mkdirSync(path.join(dir, '003-dir.md'));
    const result = spawnSync('bash', [SCRIPT, dir], { cwd: ROOT, encoding: 'utf8' });

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(!result.stdout.includes('002-link.md'), `symlink must not be enumerated; got: ${result.stdout}`);
    assert.ok(!result.stdout.includes('003-dir.md'), `directory must not be enumerated; got: ${result.stdout}`);
    assert.ok(result.stdout.includes('001-ok.md'), `expected the real record; got: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
