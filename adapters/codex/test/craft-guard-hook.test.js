import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'craft-guard.js');
const WORKING_DIR = '/repo';

// Spawns OUR hook script under `node`, never the real `codex` binary — the
// only permitted way to exercise a subprocess-exit-code contract.
function run(payload) {
  return spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
}

function execPayload(cmd) {
  return JSON.stringify({ cwd: WORKING_DIR, tool_name: 'exec_command', tool_input: { cmd } });
}

function patchPayload(...paths) {
  const lines = ['*** Begin Patch'];
  for (const path of paths) {
    lines.push(`*** Add File: ${path}`, '+x');
  }
  lines.push('*** End Patch');
  return JSON.stringify({
    cwd: WORKING_DIR,
    tool_name: 'apply_patch',
    tool_input: { input: lines.join('\n') },
  });
}

describe('craft-guard hook — enforcing exit-code contract', () => {
  it('Given a payload whose exec_command runs git diff, when the hook process runs, then it exits with code 2', () => {
    const sut = run(execPayload('git diff'));

    assert.equal(sut.status, 2);
  });

  it('Given a blocking payload, when the hook process runs, then the block reason appears on stderr and stdout is empty', () => {
    const sut = run(execPayload('git diff'));

    assert.match(sut.stderr, /--no-ext-diff/);
    assert.equal(sut.stdout, '');
  });

  it('Given a compliant payload, when the hook process runs, then it exits 0 and writes nothing to stdout', () => {
    const sut = run(execPayload('git diff --no-ext-diff'));

    assert.equal(sut.status, 0);
    assert.equal(sut.stdout, '');
  });

  it('Given a payload that is not valid JSON, when the hook process runs, then it exits 2', () => {
    const sut = run('{not json');

    assert.equal(sut.status, 2);
  });

  it('Given an apply_patch payload whose second hunk escapes the working dir, when the hook process runs, then it exits 2', () => {
    const sut = run(patchPayload(`${WORKING_DIR}/src/a.js`, '/etc/passwd'));

    assert.equal(sut.status, 2);
  });

  it('Given empty stdin, when the hook process runs, then it exits 2', () => {
    const sut = run('');

    assert.equal(sut.status, 2);
  });

  it('Given a blocking verdict carrying no reason, when the hook process runs, then stderr still carries a non-empty denial line', () => {
    const payload = JSON.stringify({
      cwd: WORKING_DIR,
      tool_name: 'apply_patch',
      tool_input: {},
    });

    const sut = run(payload);

    assert.equal(sut.status, 2);
    assert.match(sut.stderr, /craft-guard/);
    assert.notEqual(sut.stderr.trim(), '');
  });

  it('Given the hook source text, when scanned, then it contains no finally block', () => {
    const sourceText = readFileSync(HOOK, 'utf8');

    assert.doesNotMatch(sourceText, /\bfinally\b/);
  });
});
