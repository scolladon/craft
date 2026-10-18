'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { UNSIGNED_COMMIT_CONFIG, withFailingCommitSigner } = require('./helpers/commit-signing');
const { sliceProse } = require('./helpers/region-slice');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

function runCmd(cmd, args = [], opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return {
      status: err.status ?? 1,
      output: (err.stdout ?? '') + (err.stderr ?? ''),
    };
  }
}

function git(args, opts = {}) {
  execFileSync('git', [...UNSIGNED_COMMIT_CONFIG, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

function initRepo(repoDir) {
  git(['init', '-q', repoDir]);
  git(['-C', repoDir, 'config', 'user.email', 'test@craft']);
  git(['-C', repoDir, 'config', 'user.name', 'craft-test']);
  git(['-C', repoDir, 'commit', '--allow-empty', '-q', '-m', 'init']);
}

function initInPlaceRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-inplace-'));
  initRepo(repo);
  git(['-C', repo, 'branch', '-M', 'main']);
  return repo;
}

function mkWorktreeNoRemote(repoDir, wtDir, branch) {
  initRepo(repoDir);
  git(['-C', repoDir, 'worktree', 'add', '-q', '--orphan', wtDir, '-b', branch]);
  git(['-C', wtDir, 'commit', '--allow-empty', '-q', '-m', 'wt-init']);
}

function mkWorktree(repoDir, wtDir, branch) {
  mkWorktreeNoRemote(repoDir, wtDir, branch);
  git(['-C', repoDir, 'remote', 'add', 'origin', repoDir]);
}

function branchExists(repoDir, branchRef) {
  try {
    execFileSync('git', ['-C', repoDir, 'rev-parse', '--verify', '--quiet', branchRef], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const LOCK_NAME = 'craft-validation.lock';

function lockPathOf(worktree) {
  return execFileSync(
    'git',
    ['-C', worktree, 'rev-parse', '--path-format=absolute', '--git-path', LOCK_NAME],
    { encoding: 'utf8' },
  ).trim();
}

function liveLockLine() {
  return `${process.pid} ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}\n`;
}

// The worktree path is reserved then removed: `git worktree add` refuses an existing directory.
function allocWorktreeDirs() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-repo-'));
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-wt-'));
  fs.rmSync(wt, { recursive: true, force: true });
  return { repo, wt };
}

function setup() {
  const dirs = allocWorktreeDirs();
  mkWorktree(dirs.repo, dirs.wt, 'craft-test-branch');
  return dirs;
}

function teardown({ repo, wt }) {
  if (repo) fs.rmSync(repo, { recursive: true, force: true });
  if (wt) fs.rmSync(wt, { recursive: true, force: true });
}

// The suite's own checks must not depend on the ambient config a test swaps in.
function hermeticGitEnv() {
  return {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

function headOf(dir) {
  return execFileSync('git', ['-C', dir, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', env: hermeticGitEnv() });
}

// ---------------------------------------------------------------------------
// fixture commits — independent of the ambient signer
// ---------------------------------------------------------------------------

test(
  'Given a global git config whose signer always fails, when mkWorktreeNoRemote builds a repo and worktree, then both init commits land',
  () => {
    const dirs = allocWorktreeDirs();
    try {
      const sut = mkWorktreeNoRemote;

      withFailingCommitSigner(() => sut(dirs.repo, dirs.wt, 'craft-test-branch'));

      assert.match(headOf(dirs.repo), /^[0-9a-f]+\n$/);
      assert.match(headOf(dirs.wt), /^[0-9a-f]+\n$/);
    } finally {
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-setup.sh — no lockfile branch
// ---------------------------------------------------------------------------

test(
  'Given a worktree dir with no lockfile, when setup runs, then it exits 0 and reports skipped (noted)',
  () => {
    const dirs = setup();
    try {
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'worktree-setup.sh'), dirs.wt]);
      assert.strictEqual(r.status, 0);
      assert.ok(
        r.output.includes('dependency install skipped (noted)'),
        `Expected 'dependency install skipped (noted)' in output:\n${r.output}`,
      );
    } finally {
      teardown(dirs);
    }
  },
);

test(
  'Given a worktree with a nested engine/package-lock.json, when setup runs, then it selects the nested npm branch (npm stubbed, no real install)',
  () => {
    const dirs = setup();
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-npmstub-'));
    try {
      fs.mkdirSync(path.join(dirs.wt, 'engine'));
      fs.writeFileSync(path.join(dirs.wt, 'engine', 'package-lock.json'), '');
      fs.writeFileSync(path.join(stubDir, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'worktree-setup.sh'), dirs.wt], {
        env: { ...process.env, PATH: stubDir + ':' + process.env.PATH },
      });
      assert.strictEqual(r.status, 0);
      assert.ok(
        r.output.includes('installed in-worktree via npm (nested: engine)'),
        `Expected nested npm message in output:\n${r.output}`,
      );
    } finally {
      fs.rmSync(stubDir, { recursive: true, force: true });
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-setup.sh — post-setup script branch
// ---------------------------------------------------------------------------

test(
  'Given a worktree dir and a post-setup script, when setup runs, then it exits 0 and reports the script ran',
  () => {
    const dirs = setup();
    const postScript = path.join(os.tmpdir(), `post-${Date.now()}.sh`);
    try {
      fs.writeFileSync(postScript, '#!/bin/sh\n', { mode: 0o755 });
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'worktree-setup.sh'), dirs.wt, postScript]);
      assert.strictEqual(r.status, 0);
      assert.ok(
        r.output.includes('post-setup script ran:'),
        `Expected 'post-setup script ran:' in output:\n${r.output}`,
      );
      assert.ok(
        r.output.includes(postScript),
        `Expected post-script path in output:\n${r.output}`,
      );
    } finally {
      try { fs.unlinkSync(postScript); } catch { /* already removed */ }
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-teardown.sh — live-lock refusal (no --force)
// ---------------------------------------------------------------------------

test(
  'Given a live-PID lock at the worktree git-path lock, when teardown runs without --force, then it exits 3, reports REFUSED and leaves the lock intact',
  () => {
    const dirs = setup();
    try {
      const lockPath = lockPathOf(dirs.wt);
      fs.writeFileSync(lockPath, liveLockLine());
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'worktree-teardown.sh'), dirs.repo, dirs.wt]);
      assert.strictEqual(r.status, 3);
      assert.ok(r.output.includes('REFUSED'), `Expected 'REFUSED' in output:\n${r.output}`);
      assert.ok(
        r.output.includes('validation run alive'),
        `Expected 'validation run alive' in output:\n${r.output}`,
      );
      assert.ok(fs.existsSync(lockPath), 'Live lock should remain intact after refusal');
    } finally {
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-teardown.sh — live-lock forced past
// ---------------------------------------------------------------------------

test(
  'Given a live-PID lock at the worktree git-path lock, when teardown runs with --force, then it exits 0, reports FORCED, and removes the lock and the worktree',
  () => {
    const dirs = setup();
    try {
      const lockPath = lockPathOf(dirs.wt);
      fs.writeFileSync(lockPath, liveLockLine());
      const r = runCmd('bash', [
        path.join(SCRIPTS_DIR, 'worktree-teardown.sh'),
        dirs.repo,
        dirs.wt,
        '--force',
      ]);
      assert.strictEqual(r.status, 0);
      assert.ok(
        r.output.includes('FORCED past live validation run'),
        `Expected 'FORCED past live validation run' in output:\n${r.output}`,
      );
      assert.ok(!fs.existsSync(lockPath), 'Lock file should be removed after --force');
      assert.ok(!fs.existsSync(dirs.wt), 'Worktree directory should be removed after --force');
    } finally {
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-teardown.sh — stale-lock auto-cleared
// ---------------------------------------------------------------------------

test(
  'Given a dead-PID lock at the worktree git-path lock, when teardown runs, then it reports stale lock auto-cleared and removes the worktree and branch',
  () => {
    const dirs = setup();
    try {
      // A reaped child PID is provably dead — more reliable than a fixed high number.
      const child = spawnSync('sh', ['-c', 'exit 0']);
      const deadPid = child.pid;
      const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const lockPath = lockPathOf(dirs.wt);
      fs.writeFileSync(lockPath, `${deadPid} ${ts}\n`);
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'worktree-teardown.sh'), dirs.repo, dirs.wt]);
      assert.strictEqual(r.status, 0);
      assert.ok(r.output.includes('stale lock'), `Expected 'stale lock' in output:\n${r.output}`);
      assert.ok(r.output.includes('auto-cleared'), `Expected 'auto-cleared' in output:\n${r.output}`);
      assert.ok(!fs.existsSync(dirs.wt), 'Worktree directory should be removed');
      assert.ok(
        !branchExists(dirs.repo, 'refs/heads/craft-test-branch'),
        'craft-test-branch should be pruned after teardown',
      );
    } finally {
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-teardown.sh — no-remote repo (the `git fetch --prune` abort)
// ---------------------------------------------------------------------------

test(
  'Given a worktree on a repo with no remote, when teardown runs, then it exits 0 and removes the worktree and branch',
  () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-norem-repo-'));
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-norem-wt-'));
    fs.rmSync(wt, { recursive: true, force: true });
    mkWorktreeNoRemote(repo, wt, 'norem-branch');
    try {
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'worktree-teardown.sh'), repo, wt]);
      assert.strictEqual(r.status, 0);
      assert.ok(r.output.includes('worktree removed'), `Expected 'worktree removed' in output:\n${r.output}`);
      assert.ok(!fs.existsSync(wt), 'Worktree directory should be removed');
      assert.ok(
        !branchExists(repo, 'refs/heads/norem-branch'),
        'norem-branch should be pruned after teardown',
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(wt, { recursive: true, force: true });
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-teardown.sh — non-canonical PID is not a live process
// ---------------------------------------------------------------------------

test(
  'Given a git-path lock whose PID is -1 (kill -0 -1 signals a process group), when teardown runs, then the numeric guard treats it as stale, not live',
  () => {
    const dirs = setup();
    try {
      const lockPath = lockPathOf(dirs.wt);
      fs.writeFileSync(lockPath, '-1 2026-01-01T00:00:00Z\n');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'worktree-teardown.sh'), dirs.repo, dirs.wt]);
      assert.strictEqual(r.status, 0);
      assert.ok(!r.output.includes('REFUSED'), `Expected no REFUSED in output:\n${r.output}`);
      assert.ok(r.output.includes('stale lock'), `Expected 'stale lock' in output:\n${r.output}`);
      assert.ok(!fs.existsSync(lockPath), 'Lock file should be removed');
    } finally {
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-teardown.sh — realpath guard protects the main checkout
// ---------------------------------------------------------------------------

test(
  'Given WT and MAIN that resolve to the same path via different spellings, when teardown runs, then it does not attempt a worktree remove',
  () => {
    const repo = initInPlaceRepo();
    try {
      const r = runCmd('bash', [
        path.join(SCRIPTS_DIR, 'worktree-teardown.sh'),
        repo,
        repo + '/.',
      ]);
      assert.strictEqual(r.status, 0);
      assert.ok(
        !r.output.includes('worktree removed'),
        `Expected no 'worktree removed' in output:\n${r.output}`,
      );
      assert.ok(fs.existsSync(repo), 'Repo directory should still exist');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  },
);

// ---------------------------------------------------------------------------
// worktree-teardown.sh — the run-lock lives in the per-worktree git dir
// ---------------------------------------------------------------------------

const TEARDOWN_SCRIPT = path.join(SCRIPTS_DIR, 'worktree-teardown.sh');

// A reaped child PID is provably dead — more reliable than a fixed high number.
function deadLockLine() {
  const child = spawnSync('sh', ['-c', 'exit 0']);
  return `${child.pid} ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}\n`;
}

test(
  'Given a live-PID lock only at the old in-tree path, when teardown runs, then it exits 0 and removes the worktree',
  () => {
    // Arrange
    const dirs = setup();
    const sut = TEARDOWN_SCRIPT;
    try {
      fs.writeFileSync(path.join(dirs.wt, '.craft-validation.lock'), liveLockLine());

      // Act
      const result = runCmd('bash', [sut, dirs.repo, dirs.wt]);

      // Assert
      assert.strictEqual(result.status, 0);
      assert.ok(!result.output.includes('REFUSED'), `Expected no REFUSED in output:\n${result.output}`);
      assert.ok(!fs.existsSync(dirs.wt), 'Worktree directory should be removed');
    } finally {
      teardown(dirs);
    }
  },
);

test(
  'Given an in-place checkout with a live-PID lock in its git dir, when teardown runs with WT equal to MAIN, then it exits 3, reports REFUSED and keeps the checkout and the lock',
  () => {
    // Arrange
    const repo = initInPlaceRepo();
    const sut = TEARDOWN_SCRIPT;
    try {
      const lockPath = lockPathOf(repo);
      fs.writeFileSync(lockPath, liveLockLine());

      // Act
      const result = runCmd('bash', [sut, repo, repo]);

      // Assert
      assert.strictEqual(result.status, 3);
      assert.ok(result.output.includes('REFUSED'), `Expected 'REFUSED' in output:\n${result.output}`);
      assert.ok(fs.existsSync(repo), 'Checkout should remain');
      assert.ok(fs.existsSync(lockPath), 'Lock should remain');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  },
);

test(
  'Given an in-place checkout with a dead-PID lock in its git dir, when teardown runs with WT equal to MAIN, then it auto-clears the lock and keeps the checkout',
  () => {
    // Arrange
    const repo = initInPlaceRepo();
    const sut = TEARDOWN_SCRIPT;
    try {
      const lockPath = lockPathOf(repo);
      fs.writeFileSync(lockPath, deadLockLine());

      // Act
      const result = runCmd('bash', [sut, repo, repo]);

      // Assert
      assert.strictEqual(result.status, 0);
      assert.ok(result.output.includes('auto-cleared'), `Expected 'auto-cleared' in output:\n${result.output}`);
      assert.ok(!fs.existsSync(lockPath), 'Lock should be removed');
      assert.ok(fs.existsSync(repo), 'Checkout should remain');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  },
);

test(
  'Given an in-place checkout with a live-PID lock in its git dir, when teardown runs with --force and WT equal to MAIN, then it removes the lock and keeps the checkout',
  () => {
    // Arrange
    const repo = initInPlaceRepo();
    const sut = TEARDOWN_SCRIPT;
    try {
      const lockPath = lockPathOf(repo);
      fs.writeFileSync(lockPath, liveLockLine());

      // Act
      const result = runCmd('bash', [sut, repo, repo, '--force']);

      // Assert
      assert.strictEqual(result.status, 0);
      assert.ok(result.output.includes('FORCED'), `Expected 'FORCED' in output:\n${result.output}`);
      assert.ok(!fs.existsSync(lockPath), 'Lock should be removed');
      assert.ok(fs.existsSync(repo), 'Checkout should remain');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  },
);

test(
  'Given a worktree path that is not a git worktree, when teardown runs, then it exits 2, reports it cannot resolve the run-lock path, and removes nothing',
  () => {
    // Arrange
    const dirs = setup();
    const notGit = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-not-git-'));
    const sut = TEARDOWN_SCRIPT;
    try {
      // Act
      const result = runCmd('bash', [sut, dirs.repo, notGit]);

      // Assert
      assert.strictEqual(result.status, 2);
      assert.ok(
        result.output.includes('cannot resolve the run-lock path'),
        `Expected 'cannot resolve the run-lock path' in output:\n${result.output}`,
      );
      assert.ok(fs.existsSync(notGit), 'Non-git directory should remain');
      assert.ok(fs.existsSync(dirs.wt), 'Worktree directory should remain');
      assert.ok(branchExists(dirs.repo, 'refs/heads/craft-test-branch'), 'Branch should remain');
    } finally {
      fs.rmSync(notGit, { recursive: true, force: true });
      teardown(dirs);
    }
  },
);

// ---------------------------------------------------------------------------
// Prose — the run-lock path is the git-path lock, never the working tree
// ---------------------------------------------------------------------------

const REPO_ROOT = path.join(__dirname, '..');
const IN_TREE_LOCK = '.craft-validation.lock';

test(
  'Given the validation skill background run bullet, when read, then the run-lock is written at the git-path lock and never in the working tree',
  () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'validation', 'SKILL.md'), 'utf8');

    const sut = sliceProse(text, /^\s+- \*\*`run-style: background`\*\*/, /^\s+The backgrounded command's first statement/);

    assert.ok(sut.includes('--git-path craft-validation.lock'));
    assert.ok(sut.includes('--path-format=absolute'));
    assert.ok(!sut.includes(IN_TREE_LOCK));
  },
);

test(
  'Given the vcs spec teardown bullet and lock protocol, when read, then the protocol names the git-path lock and the exit 2 case and neither names the in-tree lock',
  () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'contributing', 'specs', 'vcs.md'), 'utf8');

    const bullet = sliceProse(text, /^- `teardown\(workspacePath\)/, /^## Teardown lock protocol/);
    const sut = sliceProse(text, /^## Teardown lock protocol/, /^## /);

    assert.ok(sut.includes('--git-path craft-validation.lock'));
    assert.ok(sut.includes('--path-format=absolute'));
    assert.ok(sut.includes('exit 2'));
    assert.ok(sut.includes('git worktree remove'));
    assert.ok(!bullet.includes(IN_TREE_LOCK));
    assert.ok(!sut.includes(IN_TREE_LOCK));
  },
);
