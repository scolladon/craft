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

test('Given scripts/ci.sh, when its content is read, then it both defines and CALLS run_adr_lint', () => {
  const content = fs.readFileSync(CI_SCRIPT, 'utf8');

  // The definition alone is not the gate. adr-lint was moved out of the
  // unconditional && chain, so only the call site keeps it running.
  assert.ok(content.includes('run_adr_lint()'), 'expected scripts/ci.sh to define run_adr_lint');
  assert.match(content, /^run_adr_lint$/m, 'expected scripts/ci.sh to call run_adr_lint');
});

test('Given run_adr_lint, when its waiver sources are read, then they are whole-corpus rather than merge-base scoped', () => {
  const content = fs.readFileSync(CI_SCRIPT, 'utf8');

  // A waiver scoped to the touched set lasts exactly one PR: on a push to main
  // the touched set is empty and every waived citation fails a blocking gate.
  assert.ok(
    content.includes("git ls-files -z -- 'docs/contributing/design/*.md' 'docs/contributing/plan/*.md'"),
    'expected run_adr_lint to collect waiver sources from the dated-ledger tier'
  );
});
