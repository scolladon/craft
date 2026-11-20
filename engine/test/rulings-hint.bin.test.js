import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '..', 'bin', 'rulings-hint.js');
const RULING = '- R-900 [src/a.js] Keep a settled.';

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function registerFile() {
  const dir = mkdtempSync(join(tmpdir(), 'rulings-hint-'));
  tmpDirs.push(dir);
  const file = join(dir, 'RULINGS.md');
  writeFileSync(file, `# Rulings\n\n${RULING}\n`);
  return file;
}

test('Given a register and a touched path on stdin, When the bin runs, Then it prints the matching ruling and exits 0', () => {
  const file = registerFile();

  const sut = spawnSync(process.execPath, [BIN, '--register', file], { input: 'src/a.js\n', encoding: 'utf8' });

  assert.equal(sut.status, 0);
  assert.match(sut.stdout, new RegExp(`^Rulings \\(settled.*\\n${RULING.replace(/[[\]]/g, '\\$&')}\\n$`));
});

test('Given no arguments, When the bin runs, Then it exits 2 with usage on stderr', () => {
  const sut = spawnSync(process.execPath, [BIN], { input: '', encoding: 'utf8' });

  assert.equal(sut.status, 2);
  assert.match(sut.stderr, /^usage: rulings-hint/);
});
