import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAtomicWriter, PRIVATE_FILE_MODE } from '../src/atomic-write.js';

const TARGET = '/fixture/codex-home/config.toml';
const TEXT = '[hooks.state."k"]\ntrusted_hash = "sha256:abc"\n';
const OPERATOR_MODE = 0o644;
const MISSING_FILE_ERROR_CODE = 'ENOENT';

function missingFileError() {
  const error = new Error(`ENOENT: no such file or directory, stat '${TARGET}'`);
  error.code = MISSING_FILE_ERROR_CODE;
  return error;
}

function createFakeFs({ statResult = missingFileError() } = {}) {
  const calls = [];
  const deps = {
    writeFile(path, text, options) {
      calls.push({ op: 'writeFile', path, text, options });
    },
    rename(from, to) {
      calls.push({ op: 'rename', from, to });
    },
    chmod(path, mode) {
      calls.push({ op: 'chmod', path, mode });
    },
    stat(path) {
      calls.push({ op: 'stat', path });
      if (statResult instanceof Error) {
        throw statResult;
      }
      return statResult;
    },
  };
  return { deps, calls };
}

function operationsOf(calls, op) {
  return calls.filter((call) => call.op === op);
}

describe('createAtomicWriter()', () => {
  it('Given a target path, when the writer runs, then the content is written to a different path and only then renamed onto the target', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    const [write] = operationsOf(calls, 'writeFile');
    const [rename] = operationsOf(calls, 'rename');
    assert.notEqual(write.path, TARGET);
    assert.equal(write.text, TEXT);
    assert.equal(rename.from, write.path);
    assert.equal(rename.to, TARGET);
    assert.ok(calls.indexOf(write) < calls.indexOf(rename));
  });

  it('Given a target path, when the writer runs, then the target itself is never opened for writing so a crash cannot leave it truncated', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    assert.deepEqual(operationsOf(calls, 'writeFile').map((call) => call.path === TARGET), [false]);
  });

  it('Given a target in a directory, when the writer runs, then the temporary file sits beside it so the rename stays within one filesystem', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    const [write] = operationsOf(calls, 'writeFile');
    assert.ok(write.path.startsWith('/fixture/codex-home/'));
  });

  it('Given an absent target, when the writer runs, then the temporary file is created private to its owner', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    assert.equal(operationsOf(calls, 'writeFile')[0].options.mode, PRIVATE_FILE_MODE);
    assert.equal(operationsOf(calls, 'chmod')[0].mode, PRIVATE_FILE_MODE);
  });

  it("Given an existing target, when the writer runs, then the operator's own file mode is carried onto the replacement", () => {
    const { deps, calls } = createFakeFs({ statResult: { mode: 0o100000 | OPERATOR_MODE } });
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    assert.equal(operationsOf(calls, 'writeFile')[0].options.mode, OPERATOR_MODE);
    assert.equal(operationsOf(calls, 'chmod')[0].mode, OPERATOR_MODE);
  });

  it('Given a stat that fails for a reason other than the file being absent, when the writer runs, then it rethrows rather than writing under a guessed mode', () => {
    const denied = new Error('EACCES: permission denied');
    denied.code = 'EACCES';
    const { deps, calls } = createFakeFs({ statResult: denied });
    const sut = createAtomicWriter(deps);

    assert.throws(() => sut(TARGET, TEXT), /EACCES/);
    assert.deepEqual(operationsOf(calls, 'writeFile'), []);
  });
});
