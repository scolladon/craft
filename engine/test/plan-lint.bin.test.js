import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'plan-lint.js');

function run(...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

const GOOD_PLAN = `# Plan — Test topic

## Part 1 — first thing

### Context

Do the first thing.

### TDD steps

1. RED then GREEN.

### Gate

echo ok

### Commit

feat: first thing
`;

const BAD_PLAN = `# Plan — Test topic

## Part 1 — first thing

### Context

Do the first thing.
`;

test('Given a schema-valid plan fixture, when the plan-lint bin is spawned, then it exits 0 with the "part(s) OK" line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'planlint-bin-'));
  try {
    const plan = join(dir, 'good.md');
    writeFileSync(plan, GOOD_PLAN);

    const result = run(plan);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('part(s) OK'), `stdout was: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a schema-invalid plan fixture, when the plan-lint bin is spawned, then it exits 2 with the "violate the schema" line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'planlint-bin-'));
  try {
    const plan = join(dir, 'bad.md');
    writeFileSync(plan, BAD_PLAN);

    const result = run(plan);

    assert.equal(result.status, 2);
    assert.ok(result.stdout.includes('violate the schema'), `stdout was: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
