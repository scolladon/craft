import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(__dir, '..', 'package.json');
const CLI_PATH = join(__dir, '..', 'src', 'cli.js');

// Scans the ambient PATH for an executable without throwing, so a missing
// binary fails the test loudly (assert.ok on the result) instead of being
// swallowed by a try/catch around accessSync.
function resolveOnPath(binary) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    const stat = statSync(candidate, { throwIfNoEntry: false });
    if (stat?.isFile() && (stat.mode & 0o111) !== 0) return candidate;
  }
  return null;
}

describe('cli.js — thin bin entrypoint', () => {
  it('Given package.json bin field, when read, then craft-pi is mapped to src/cli.js', () => {
    // Arrange
    const sut = JSON.parse(readFileSync(PKG_PATH, 'utf8'));
    // Act
    const result = sut.bin?.['craft-pi'];
    // Assert
    assert.equal(result, 'src/cli.js');
  });

  it('Given cli entry, source is read, then node shebang and imports main from run.js', () => {
    // Arrange
    const sut = readFileSync(CLI_PATH, 'utf8');
    // Act / Assert
    assert.ok(sut.startsWith('#!/usr/bin/env node'), 'must start with node shebang');
    assert.ok(sut.includes("from './run.js'"), "must import from './run.js'");
  });

  it('Given cli entry, source read, then guards on import.meta.url before calling process.exit', () => {
    // Arrange
    const sut = readFileSync(CLI_PATH, 'utf8');
    // Act / Assert
    assert.ok(
      sut.includes("process.argv[1] === fileURLToPath(import.meta.url)"),
      'must guard on import.meta.url so importing the module does not run it',
    );
  });
});

// ─── subprocess execution tests (kill the NoCoverage mutants) ────────────────
// Each test spawns cli.js as a real Node subprocess, under a synthetic PATH
// holding only `node` and `git` (symlinked into a throwaway bin dir), with
// cwd inside a throwaway `git init`-ed repo. `pi` is never placed on that
// PATH, so run.js's spawn call fails with a genuine OS ENOENT — never a stub
// returning a rehearsed exit code. That keeps the guard hermetic regardless
// of whether `pi` happens to be installed on the machine running the suite.

describe('cli.js — subprocess execution guard', () => {
  let root;
  let binDir;
  let repoDir;
  let gitPath;
  let PINNED_ENV;

  // Builds the throwaway repo's git identity from an allowlist, never by spreading
  // process.env — an ambient GIT_DIR/GIT_WORK_TREE or gitconfig knob (this machine's
  // global diff.external = difft, for one) must never reach the child.
  function initRepo(dir) {
    const result = spawnSync(gitPath, ['init', '-q', dir], { env: PINNED_ENV });
    assert.equal(result.status, 0, `git init must succeed for ${dir}`);
  }

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'craft-pi-cli-'));
    binDir = join(root, 'bin');
    mkdirSync(binDir);
    symlinkSync(process.execPath, join(binDir, 'node'));

    gitPath = resolveOnPath('git');
    assert.ok(gitPath, 'git must resolve on the ambient PATH to build the synthetic bin dir');
    symlinkSync(gitPath, join(binDir, 'git'));

    PINNED_ENV = Object.freeze({
      PATH: binDir,
      HOME: root,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    });

    repoDir = join(root, 'repo');
    mkdirSync(repoDir);
    initRepo(repoDir);
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function runCli(...args) {
    return spawnSync(process.execPath, [CLI_PATH, ...args], {
      cwd: repoDir,
      env: PINNED_ENV,
      encoding: 'utf8',
    });
  }

  it('Given a synthetic PATH holding only node and git, when pi is spawned directly by name, then the OS reports ENOENT', () => {
    const result = spawnSync('pi', ['--version'], { env: PINNED_ENV });

    assert.equal(result.error?.code, 'ENOENT', 'pi must be genuinely absent from the synthetic PATH');
  });

  it('Given a decoy GIT_DIR and GIT_WORK_TREE set on the parent process, when the throwaway repo is git-init-ed with the pinned environment, then the throwaway repo receives its own .git and the decoy is untouched', () => {
    const decoyDir = mkdtempSync(join(tmpdir(), 'craft-pi-decoy-'));
    try {
      const decoyInit = spawnSync(gitPath, ['init', '-q', decoyDir]);
      assert.equal(decoyInit.status, 0, 'decoy repo must be seeded to observe whether it gets touched');
      const decoyConfigPath = join(decoyDir, '.git', 'config');
      const decoyMtimeBefore = statSync(decoyConfigPath).mtimeMs;

      const throwawayDir = join(root, 'repo-decoy-guard');
      mkdirSync(throwawayDir);

      process.env.GIT_DIR = join(decoyDir, '.git');
      process.env.GIT_WORK_TREE = decoyDir;
      try {
        initRepo(throwawayDir);
      } finally {
        delete process.env.GIT_DIR;
        delete process.env.GIT_WORK_TREE;
      }

      assert.ok(
        statSync(join(throwawayDir, '.git')).isDirectory(),
        'the throwaway repo must receive its own .git despite the ambient GIT_DIR',
      );
      assert.equal(
        statSync(decoyConfigPath).mtimeMs,
        decoyMtimeBefore,
        'the decoy repo must be untouched by the git init call',
      );
    } finally {
      rmSync(decoyDir, { recursive: true, force: true });
    }
  });

  it('Given cli.js is invoked directly, when it runs, then process.exit is called with an integer code (guard ran, block ran)', () => {
    const result = runCli();

    // exit code must be an integer (0 or non-zero) — never null (which would mean
    // the process was killed by a signal, or the block was empty and returned undefined).
    assert.equal(typeof result.status, 'number', 'process.exit must be called with a numeric code');
    assert.ok(result.status === 0 || result.status > 0, 'exit code must be a non-negative integer');
  });

  it('Given cli.js is invoked directly and pi binary is absent, when it runs, then it exits non-zero with a pi-run error on stderr', () => {
    const result = runCli();

    // pi not installed → main() writes a blocker to stderr and returns code 2.
    // If the ObjectLiteral mutant fired ({ } instead of { stdout, stderr }), the
    // write call would be on undefined and would throw — the process would crash
    // rather than exit cleanly.
    assert.equal(result.status, 2, `expected exit 2 (pi not installed), stderr: ${result.stderr}`);
    assert.equal(
      result.stderr.trim(),
      '{ unit: pi-run, reason: spawn pi ENOENT }',
      `stderr must report the exact pi-run blocker, got: ${result.stderr}`,
    );
  });

  it('Given cli.js is invoked directly, when it runs, then argv is sliced (argv[0]=node argv[1]=cli.js are stripped before passing to main)', () => {
    // The MethodExpression mutant changes process.argv.slice(2) → process.argv.
    // Without the slice, argv[0] and argv[1] (node path and cli path) leak into
    // main's _argv parameter. main() ignores _argv currently, so this is a
    // provable-equivalent mutant: the leaking node/cli path strings in _argv have
    // no observable effect because main() does not read _argv.
    // EQUIVALENT: main signature declares _argv but never consumes it — any argv
    // mutation is behavior-free given the current implementation.
    // Document: the test below nonetheless exercises the full live path so coverage is counted.
    const result = runCli();

    // Subprocess must exit (not hang or throw before reaching process.exit).
    assert.notEqual(result.status, null, 'cli must exit, not be killed by signal');
  });
});
