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

function failure(message) {
  const error = new Error(message);
  error.code = message.split(':')[0];
  return error;
}

// Both lookups answer about the path they are asked about: realpath resolves the
// link (or reports the file absent), and stat only recognises whatever realpath
// resolved to. Without that, a writer that statted its own temporary path, or one
// that ignored the link entirely, would still look like it inherited the
// operator's mode.
function createFakeFs({
  statResult = missingFileError(),
  realpathResult = missingFileError(),
  writeFileError,
  chmodError,
  renameError,
  unlinkError,
} = {}) {
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
      if (writeFileError) {
        throw writeFileError;
      }
    },
    rename(from, to) {
      calls.push({ op: 'rename', from, to });
      if (renameError) {
        throw renameError;
      }
    },
    unlink(path) {
      calls.push({ op: 'unlink', path });
      if (unlinkError) {
        throw unlinkError;
      }
    },
    chmod(path, mode) {
      calls.push({ op: 'chmod', path, mode });
      if (chmodError) {
        throw chmodError;
      }
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

describe('createAtomicWriter() — the temporary file is this run\'s alone', () => {
  // A fixed temp name is a path an attacker (or an interrupted earlier run) can
  // occupy in advance: the write then follows a planted symlink, or lands at a
  // leftover file's mode, and the rename installs that as the operator's config.
  it('Given two runs against the same target, when each writer runs, then they write to different temporary paths', () => {
    const first = createFakeFs();
    const second = createFakeFs();

    createAtomicWriter(first.deps)(TARGET, TEXT);
    createAtomicWriter(second.deps)(TARGET, TEXT);

    const sut = [first, second].map(({ calls }) => operationsOf(calls, 'writeFile')[0].path);
    assert.notEqual(sut[0], sut[1]);
  });

  // A run that dies between the create and the rename leaves this file sitting in
  // the operator's own config directory. Its name is the only thing telling them
  // what left it there and that it is a partial write rather than something of
  // theirs — spelled out here rather than imported, so emptying either part of
  // the name fails instead of comparing the writer against itself.
  it('Given a target path, when the writer creates the temporary file, then its name says whose it is and that it is a temporary', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    const [write] = operationsOf(calls, 'writeFile');
    assert.ok(write.path.includes('.craft-trust-hook.'));
    assert.ok(write.path.endsWith('.tmp'));
  });

  it('Given a target path, when the writer creates the temporary file, then it demands an exclusive create so an existing path is never followed or reused', () => {
    const { deps, calls } = createFakeFs();
    const sut = createAtomicWriter(deps);

    sut(TARGET, TEXT);

    assert.equal(operationsOf(calls, 'writeFile')[0].options.flag, 'wx');
  });
});

describe('createAtomicWriter() — a failed write leaves nothing behind', () => {
  const FAILURES = [
    ['the write itself fails', { writeFileError: failure('ENOSPC: no space left on device') }],
    ['the chmod fails', { chmodError: failure('EPERM: operation not permitted') }],
    ['the rename fails', { renameError: failure('EXDEV: cross-device link not permitted') }],
  ];

  for (const [label, options] of FAILURES) {
    it(`Given ${label}, when the writer runs, then the error reaches the caller and the temporary file is removed`, () => {
      const { deps, calls } = createFakeFs(options);
      const sut = createAtomicWriter(deps);

      assert.throws(() => sut(TARGET, TEXT), /ENOSPC|EPERM|EXDEV/);

      const [write] = operationsOf(calls, 'writeFile');
      assert.deepEqual(operationsOf(calls, 'unlink').map((call) => call.path), [write.path]);
    });
  }

  it('Given a write that fails, when the writer runs, then no rename is ever attempted onto the target', () => {
    const { deps, calls } = createFakeFs({ writeFileError: failure('ENOSPC: no space left on device') });
    const sut = createAtomicWriter(deps);

    assert.throws(() => sut(TARGET, TEXT));

    assert.deepEqual(operationsOf(calls, 'rename'), []);
  });

  // An already-absent temporary file is the state the cleanup is aiming at, so
  // reaching it is not a second failure to report: the caller must be handed the
  // failure that actually stopped the write, not one wrapped around a non-event.
  it('Given a rename that fails and a temporary file already gone, when the writer runs, then the original failure is what surfaces', () => {
    const renameError = failure('EXDEV: cross-device link not permitted');
    const { deps } = createFakeFs({ renameError, unlinkError: missingFileError() });
    const sut = createAtomicWriter(deps);

    assert.throws(() => sut(TARGET, TEXT), (error) => {
      assert.equal(error, renameError);
      return true;
    });
  });

  it('Given a rename that fails and a temporary file that cannot be removed, when the writer runs, then the error names both failures rather than hiding either', () => {
    const { deps } = createFakeFs({
      renameError: failure('EXDEV: cross-device link not permitted'),
      unlinkError: failure('EPERM: operation not permitted'),
    });
    const sut = createAtomicWriter(deps);

    assert.throws(() => sut(TARGET, TEXT), (error) => {
      assert.match(error.message, /EXDEV/);
      assert.match(error.message, /EPERM/);
      return true;
    });
  });

  // Quoting the original failure in the text tells a human what happened; only
  // carrying it as the cause lets a caller re-raise or match on it.
  it('Given a rename that fails and a temporary file that cannot be removed, when the writer runs, then the original failure stays reachable as the cause', () => {
    const renameError = failure('EXDEV: cross-device link not permitted');
    const { deps } = createFakeFs({ renameError, unlinkError: failure('EPERM: operation not permitted') });
    const sut = createAtomicWriter(deps);

    assert.throws(() => sut(TARGET, TEXT), (error) => {
      assert.equal(error.cause, renameError);
      return true;
    });
  });
});

describe('createAtomicWriter() — a path this run did not create is not its to remove', () => {
  // The exclusive create failed BECAUSE something was already at that path, so
  // this run put nothing there: unlinking it would delete a file belonging to a
  // concurrent run, an interrupted earlier one, or whoever planted it.
  it('Given an exclusive create refused because the path was already taken, when the writer runs, then nothing is unlinked and the failure reaches the caller', () => {
    const { deps, calls } = createFakeFs({ writeFileError: failure('EEXIST: file already exists') });
    const sut = createAtomicWriter(deps);

    assert.throws(() => sut(TARGET, TEXT), /EEXIST/);

    assert.deepEqual(operationsOf(calls, 'unlink'), []);
  });
});
