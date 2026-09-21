'use strict';
// The run skill instructs the operator to call this wrapper by name, so its
// relative ENGINE_DIR resolution, its "$@" forwarding and its exit-code
// passthrough are production behaviour. Asserting that SKILL.md mentions the
// path proves none of them.
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'emit-metrics.sh');

function run(args) {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('Given no --run, when the emit-metrics wrapper is spawned, then it resolves the bin and exits non-zero naming the flag', () => {
  const result = run([]);

  assert.notStrictEqual(result.status, 0, 'the wrapper must propagate the bin exit code, not swallow it');
  assert.match(result.stderr, /missing required --run/, `stderr was: ${result.stderr}`);
});

test('Given a --run the bin rejects, when the wrapper is spawned, then the flag value reached the bin', () => {
  const result = run(['--run', 'not a valid token']);

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /invalid --run/, `"$@" forwarding is what puts the value in front of the bin: ${result.stderr}`);
});

test('Given a --ledger outside the repo root, when the wrapper is spawned, then containment still refuses it through the wrapper', () => {
  const result = run(['--run', 'wrapper-probe', '--ledger', '/tmp/escaped-ledger.md']);

  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr, /--ledger not contained/, `stderr was: ${result.stderr}`);
});
