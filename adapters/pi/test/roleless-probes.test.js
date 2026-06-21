import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRolelessProbes } from '../src/roleless-probes.js';

const CWD = '/test/repo';

// ── spawnSync double ─────────────────────────────────────────────────────────

function makeSpawnSyncDouble(response = { status: 0, stdout: '' }) {
  const calls = [];
  const spawnSyncFn = (file, args, opts) => {
    calls.push({ file, args, opts });
    return response;
  };
  return { spawnSyncFn, calls };
}

// ── execFile double ──────────────────────────────────────────────────────────

function makeExecFileDouble(response = { err: null, stdout: 'ok', stderr: '' }) {
  const calls = [];
  const execFileFn = (file, args, opts, cb) => {
    calls.push({ file, args, opts });
    cb(response.err, response.stdout, response.stderr);
  };
  return { execFileFn, calls };
}

// ── runSync — boolean probe wire-up ─────────────────────────────────────────

describe('buildRolelessProbes() — isGitRepo probe', () => {
  it('Given status 0 from spawnSync, when isGitRepo is called, then it returns true', () => {
    const { spawnSyncFn, calls } = makeSpawnSyncDouble({ status: 0, stdout: 'true\n' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.gitProbe.isGitRepo();

    assert.equal(result, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, 'git');
    assert.deepEqual(calls[0].args, ['rev-parse', '--is-inside-work-tree']);
    assert.equal(calls[0].opts.cwd, CWD);
    assert.equal(calls[0].opts.encoding, 'utf8');
  });

  it('Given non-zero status from spawnSync, when isGitRepo is called, then it returns false', () => {
    const { spawnSyncFn } = makeSpawnSyncDouble({ status: 128, stdout: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.gitProbe.isGitRepo();

    assert.equal(result, false);
  });

  it('Given the gitProbe object is returned, when accessed, then it exposes isGitRepo (object shape)', () => {
    const { spawnSyncFn } = makeSpawnSyncDouble({ status: 0, stdout: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    assert.equal(typeof sut.gitProbe, 'object');
    assert.equal(typeof sut.gitProbe.isGitRepo, 'function');
  });
});

describe('buildRolelessProbes() — hasRemote probe', () => {
  it('Given non-empty stdout, when hasRemote is called, then it returns true (remote configured)', () => {
    const { spawnSyncFn, calls } = makeSpawnSyncDouble({ status: 0, stdout: 'origin\n' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.hasRemote();

    assert.equal(result, true);
    assert.equal(calls[0].file, 'git');
    assert.deepEqual(calls[0].args, ['remote']);
    assert.equal(calls[0].opts.cwd, CWD);
  });

  it('Given empty stdout, when hasRemote is called, then it returns false (no remote)', () => {
    const { spawnSyncFn } = makeSpawnSyncDouble({ status: 0, stdout: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.hasRemote();

    assert.equal(result, false);
  });

  it('Given whitespace-only stdout, when hasRemote is called, then it returns false (whitespace trimmed)', () => {
    const { spawnSyncFn } = makeSpawnSyncDouble({ status: 0, stdout: '   \n' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.hasRemote();

    assert.equal(result, false);
  });
});

describe('buildRolelessProbes() — ghAvailable probe', () => {
  it('Given status 0 from spawnSync, when ghAvailable is called, then it returns true', () => {
    const { spawnSyncFn, calls } = makeSpawnSyncDouble({ status: 0, stdout: 'gh version 2.0.0\n' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.ghAvailable();

    assert.equal(result, true);
    assert.equal(calls[0].file, 'gh');
    assert.deepEqual(calls[0].args, ['--version']);
    assert.equal(calls[0].opts.cwd, CWD);
  });

  it('Given non-zero status, when ghAvailable is called, then it returns false (gh not installed)', () => {
    const { spawnSyncFn } = makeSpawnSyncDouble({ status: 127, stdout: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.ghAvailable();

    assert.equal(result, false);
  });
});

describe('buildRolelessProbes() — ghAuthed probe', () => {
  it('Given status 0 from spawnSync, when ghAuthed is called, then it returns true', () => {
    const { spawnSyncFn, calls } = makeSpawnSyncDouble({ status: 0, stdout: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.ghAuthed();

    assert.equal(result, true);
    assert.equal(calls[0].file, 'gh');
    assert.deepEqual(calls[0].args, ['auth', 'status']);
    assert.equal(calls[0].opts.cwd, CWD);
  });

  it('Given non-zero status, when ghAuthed is called, then it returns false (not authenticated)', () => {
    const { spawnSyncFn } = makeSpawnSyncDouble({ status: 1, stdout: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, undefined, spawnSyncFn);

    const result = sut.ghAuthed();

    assert.equal(result, false);
  });
});

// ── runAsync — side-effect probes ────────────────────────────────────────────

describe('buildRolelessProbes() — gitPush probe', () => {
  it('Given execFile succeeds, when gitPush is called, then it resolves with stdout', async () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn, calls } = makeExecFileDouble({ err: null, stdout: 'branch pushed\n', stderr: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    const result = await sut.gitPush();

    assert.equal(result, 'branch pushed\n');
    assert.equal(calls[0].file, 'git');
    assert.deepEqual(calls[0].args, ['push', '-u', 'origin', 'HEAD']);
    assert.equal(calls[0].opts.cwd, CWD);
    assert.equal(calls[0].opts.encoding, 'utf8');
  });

  it('Given execFile fails with stderr, when gitPush is called, then it rejects with stderr message', async () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn } = makeExecFileDouble({
      err: new Error('exit 1'),
      stdout: '',
      stderr: 'authentication required',
    });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    await assert.rejects(sut.gitPush(), (err) => {
      assert.match(err.message, /authentication required/);
      return true;
    });
  });

  it('Given execFile fails with no stderr, when gitPush is called, then it rejects with err.message', async () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn } = makeExecFileDouble({
      err: new Error('ENOENT: git not found'),
      stdout: '',
      stderr: '',
    });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    await assert.rejects(sut.gitPush(), (err) => {
      assert.match(err.message, /ENOENT: git not found/);
      return true;
    });
  });
});

describe('buildRolelessProbes() — ghPrCreate probe', () => {
  it('Given execFile succeeds, when ghPrCreate is called, then it resolves with stdout', async () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn, calls } = makeExecFileDouble({ err: null, stdout: 'https://github.com/x/y/pull/1\n', stderr: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    const result = await sut.ghPrCreate();

    assert.equal(result, 'https://github.com/x/y/pull/1\n');
    assert.equal(calls[0].file, 'gh');
    assert.deepEqual(calls[0].args, ['pr', 'create', '--fill']);
    assert.equal(calls[0].opts.cwd, CWD);
  });

  it('Given execFile fails, when ghPrCreate is called, then it rejects', async () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn } = makeExecFileDouble({
      err: new Error('exit 1'),
      stdout: '',
      stderr: 'no origin remote',
    });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    await assert.rejects(sut.ghPrCreate(), (err) => {
      assert.match(err.message, /no origin remote/);
      return true;
    });
  });
});

// ── runAsync — resolve/reject path assertions ────────────────────────────────

describe('buildRolelessProbes() — runAsync resolve/reject contract', () => {
  it('Given execFile calls back without error, when gitPush resolves, then result is the stdout string', async () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn } = makeExecFileDouble({ err: null, stdout: 'pushed\n', stderr: '' });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    const result = await sut.gitPush();

    assert.equal(typeof result, 'string');
    assert.equal(result, 'pushed\n');
  });

  it('Given execFile calls back with error and non-empty stderr, when gitPush rejects, then error message is stderr trimmed', async () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn } = makeExecFileDouble({
      err: new Error('nonzero'),
      stdout: '',
      stderr: '  remote: permission denied  ',
    });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    await assert.rejects(sut.gitPush(), (err) => {
      assert.equal(err.message, 'remote: permission denied');
      return true;
    });
  });

  it('Given execFile calls back with error and null stderr, when gitPush rejects, then error falls back to err.message (optional chaining on stderr?.trim())', async () => {
    // Kills the `stderr.trim()` → `stderr?.trim()` mutant: when stderr is null,
    // `stderr.trim()` throws TypeError while `stderr?.trim()` returns undefined,
    // allowing the || fallback to err.message to fire correctly.
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const baseErr = new Error('spawn failed');
    const { execFileFn } = makeExecFileDouble({
      err: baseErr,
      stdout: '',
      stderr: null,
    });
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    await assert.rejects(sut.gitPush(), (err) => {
      assert.equal(err.message, 'spawn failed');
      return true;
    });
  });
});

// ── returned object shape ────────────────────────────────────────────────────

describe('buildRolelessProbes() — returned object shape', () => {
  it('Given buildRolelessProbes is called, when the result is inspected, then it exposes all 6 probe keys', () => {
    const { spawnSyncFn } = makeSpawnSyncDouble();
    const { execFileFn } = makeExecFileDouble();
    const sut = buildRolelessProbes({ cwd: CWD }, execFileFn, spawnSyncFn);

    assert.equal(typeof sut.gitProbe, 'object');
    assert.equal(typeof sut.gitProbe.isGitRepo, 'function');
    assert.equal(typeof sut.hasRemote, 'function');
    assert.equal(typeof sut.ghAvailable, 'function');
    assert.equal(typeof sut.ghAuthed, 'function');
    assert.equal(typeof sut.gitPush, 'function');
    assert.equal(typeof sut.ghPrCreate, 'function');
  });
});
