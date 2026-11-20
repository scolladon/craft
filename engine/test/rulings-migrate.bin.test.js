import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTER_HEADER } from '../src/rulings.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'rulings-migrate.js');
const EM_DASH = '—';

const adr = (id, options) => [`# ${id} ${EM_DASH} Title ${id}`, '', '- **Status:** accepted', '', ...options, '## Decision', '', 'Settled.', ''].join('\n');
const WITH_OPTIONS = ['## Options considered', '', '1. **Alpha** *(recommended)* — a', '2. **Beta** — b', ''];

function runOver(files) {
  const root = mkdtempSync(join(tmpdir(), 'rulingsmigrate-bin-'));
  try {
    mkdirSync(join(root, 'adr'));
    for (const [name, content] of Object.entries(files)) writeFileSync(join(root, 'adr', name), content);
    return spawnSync(process.execPath, [BIN, 'register', 'adr'], { encoding: 'utf8', cwd: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Given two ADR files, when the bin is spawned, then stdout is the byte-exact register and exit 0', () => {
  const sut = runOver;

  const result = sut({ '901-a.md': adr(901, WITH_OPTIONS), '902-b.md': adr(902, []) });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${REGISTER_HEADER}- R-901 [] Title 901. Refused: Beta.\n- R-902 [] Title 902.\n`);
});

test('Given a refusing directory, when the bin is spawned, then it exits 2 with empty stdout', () => {
  const sut = runOver;

  const result = sut({ '901-a.md': adr(905, []) });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /rulings-migrate: refuse 901: /);
});

test('Given a register larger than a pipe buffer, when the bin output is piped, then every byte reaches the reader', () => {
  const root = mkdtempSync(join(tmpdir(), 'rulingsmigrate-bin-'));
  try {
    mkdirSync(join(root, 'adr'));
    const ids = Array.from({ length: 12000 }, (_, i) => 900 + i);
    ids.forEach((id) => writeFileSync(join(root, 'adr', `${id}-a.md`), adr(id, [])));
    const expected = REGISTER_HEADER + ids.map((id) => `- R-${id} [] Title ${id}.\n`).join('');

    const result = spawnSync('sh', ['-c', `${JSON.stringify(process.execPath)} ${JSON.stringify(BIN)} register adr | wc -c`], { encoding: 'utf8', cwd: root });

    assert.equal(Number(result.stdout.trim()), Buffer.byteLength(expected));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
