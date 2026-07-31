import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAtomicWriter, PRIVATE_FILE_MODE } from '../src/atomic-write.js';

const TARGET = '/fixture/codex-home/config.toml';
// Where a stow/chezmoi-managed config.toml actually lives: the path handed to the
// writer is a link, and replacing the link is not replacing the operator's file.
const RESOLVED_TARGET = '/fixture/dotfiles/codex/config.toml';
const TEXT = '[hooks.state."k"]\ntrusted_hash = "sha256:abc"\n';
const OPERATOR_MODE = 0o644;
// Spelled out rather than imported from the module under test: comparing against
// the writer's own constant asserts only that it used itself, and would stay
// green if that constant were widened to a world-writable mode.
const OWNER_ONLY_MODE = 0o600;
const GROUP_AND_OTHER_BITS = 0o077;
const MISSING_FILE_ERROR_CODE = 'ENOENT';

function missingFileError(path = TARGET) {
  const error = new Error(`ENOENT: no such file or directory, stat '${path}'`);
  error.code = MISSING_FILE_ERROR_CODE;
  return error;
}

// Both lookups answer about the path they are asked about: realpath resolves the
// link (or reports the file absent), and stat only recognises whatever realpath
// resolved to. Without that, a writer that statted its own temporary path, or one
// that ignored the link entirely, would still look like it inherited the
// operator's mode.
function createFakeFs({ statResult = missingFileError(), realpathResult = missingFileError() } = {}) {
  const calls = [];
  const resolvedTarget = realpathResult instanceof Error ? TARGET : realpathResult;
  const deps = {
    realpath(path) {
      calls.push({ op: 'realpath', path });
      if (realpathResult instanceof Error) {
        throw realpathResult;
      }
      return realpathResult;
    },
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
      if (path !== resolvedTarget) {
        throw missingFileError(path);
      }
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

  it('Given an absent target, when the writer runs, then the temporary file is created readable and writable by its owner alone', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    const mode = operationsOf(calls, 'writeFile')[0].options.mode;
    assert.equal(mode, OWNER_ONLY_MODE);
    assert.equal(mode & GROUP_AND_OTHER_BITS, 0);
    assert.equal(operationsOf(calls, 'chmod')[0].mode, OWNER_ONLY_MODE);
  });

  it('Given the mode the writer falls back to, when it is read from the module, then it grants nothing to group or other', () => {
    const sut = PRIVATE_FILE_MODE;

    assert.equal(sut, OWNER_ONLY_MODE);
    assert.equal(sut & GROUP_AND_OTHER_BITS, 0);
  });

  it('Given a target path, when the writer resolves the mode to write under, then it stats the target rather than the path it writes to', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    assert.deepEqual(operationsOf(calls, 'stat').map((call) => call.path), [TARGET]);
  });

  it('Given a target path, when the writer runs, then it re-modes the temporary file it wrote, and does so before the rename', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    const [write] = operationsOf(calls, 'writeFile');
    const [chmod] = operationsOf(calls, 'chmod');
    const [rename] = operationsOf(calls, 'rename');
    assert.equal(chmod.path, write.path);
    assert.notEqual(chmod.path, TARGET);
    assert.ok(calls.indexOf(chmod) < calls.indexOf(rename));
  });

  it("Given an existing target, when the writer runs, then the operator's own file mode is carried onto the replacement", () => {
    const { deps, calls } = createFakeFs({ statResult: { mode: 0o100000 | OPERATOR_MODE } });
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    assert.equal(operationsOf(calls, 'writeFile')[0].options.mode, OPERATOR_MODE);
    assert.equal(operationsOf(calls, 'chmod')[0].mode, OPERATOR_MODE);
  });

  it('Given a target that is a symlink into a dotfiles tree, when the writer runs, then it renames onto the file the link resolves to rather than replacing the link', () => {
    const { deps, calls } = createFakeFs({ realpathResult: RESOLVED_TARGET, statResult: { mode: 0o100000 | OPERATOR_MODE } });
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    const [write] = operationsOf(calls, 'writeFile');
    const [rename] = operationsOf(calls, 'rename');
    assert.equal(rename.to, RESOLVED_TARGET);
    assert.equal(rename.from, write.path);
    assert.ok(write.path.startsWith('/fixture/dotfiles/'));
  });

  it('Given a target that is a symlink, when the writer resolves the mode to write under, then it stats the resolved file rather than the link path', () => {
    const { deps, calls } = createFakeFs({ realpathResult: RESOLVED_TARGET, statResult: { mode: 0o100000 | OPERATOR_MODE } });
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    assert.deepEqual(operationsOf(calls, 'stat').map((call) => call.path), [RESOLVED_TARGET]);
    assert.equal(operationsOf(calls, 'writeFile')[0].options.mode, OPERATOR_MODE);
  });

  it('Given a realpath that fails for a reason other than the file being absent, when the writer runs, then it rethrows rather than writing to an unresolved path', () => {
    const denied = new Error('EACCES: permission denied');
    denied.code = 'EACCES';
    const { deps, calls } = createFakeFs({ realpathResult: denied });
    const sut = createAtomicWriter(deps);

    assert.throws(() => sut(TARGET, TEXT), /EACCES/);
    assert.deepEqual(operationsOf(calls, 'writeFile'), []);
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
