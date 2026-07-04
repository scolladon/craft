'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');
const BIN = path.join(ROOT, 'engine', 'bin', 'intention-lint.js');

// Shells out to the single-source enumerator both ci.sh and this test consume
// — see scripts/living-corpus.sh.
function enumerateCorpus() {
  const out = execFileSync('bash', [path.join(ROOT, 'scripts', 'living-corpus.sh')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').filter(Boolean);
}

test('Given scripts/ci.sh, when its content is read, then it invokes intention-lint', () => {
  const content = fs.readFileSync(CI_SCRIPT, 'utf8');

  assert.ok(content.includes('intention-lint'), 'expected scripts/ci.sh to reference intention-lint');
});

test('Given the real enumerated living corpus plus BACKLOG.md, when intention-lint runs over it, then it exits 0', () => {
  const files = enumerateCorpus();

  const result = execFileSync('node', [BIN, ...files], { cwd: ROOT, encoding: 'utf8' });

  assert.match(result, /^craft-intention: OK/);
});
