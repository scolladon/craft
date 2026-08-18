'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');

test('Given scripts/ci.sh, when its content is read, then it invokes adr-lint', () => {
  const content = fs.readFileSync(CI_SCRIPT, 'utf8');

  assert.ok(content.includes('adr-lint'), 'expected scripts/ci.sh to reference adr-lint');
});

test('Given the real ADR corpus, when adr-lint.sh runs over it, then it exits 0', () => {
  const result = spawnSync('bash', [path.join(ROOT, 'scripts', 'adr-lint.sh'), 'docs/contributing/adr'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stdout: ${result.stdout}\nstderr: ${result.stderr}`);
  assert.match(result.stdout, /^craft-adr: OK/);
});
