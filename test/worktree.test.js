'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

function mkWorktreeNoRemote(repoDir, wtDir, branch) {
  git(['init', '-q', repoDir]);
  git(['-C', repoDir, 'config', 'user.email', 'test@craft']);
  git(['-C', repoDir, 'config', 'user.name', 'craft-test']);
  git(['-C', repoDir, 'commit', '--allow-empty', '-q', '-m', 'init']);
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

function setup() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-repo-'));
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-wt-'));
  fs.rmSync(wt, { recursive: true, force: true });
  mkWorktree(repo, wt, 'craft-test-branch');
  return { repo, wt };
}

function teardown({ repo, wt }) {
  if (repo) fs.rmSync(repo, { recursive: true, force: true });
  if (wt) fs.rmSync(wt, { recursive: true, force: true });
}

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
  'Given a live-PID lock in the worktree, when teardown runs without --force, then it exits 3 and reports REFUSED',
  () => {
    const dirs = setup();
    try {
      const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const lockPath = path.join(dirs.wt, '.craft-validation.lock');
      fs.writeFileSync(lockPath, `${process.pid} ${ts}\n`);
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
  'Given a live-PID lock in the worktree, when teardown runs with --force, then it exits 0, reports FORCED, and removes the lock',
  () => {
    const dirs = setup();
    try {
      const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const lockPath = path.join(dirs.wt, '.craft-validation.lock');
      fs.writeFileSync(lockPath, `${process.pid} ${ts}\n`);
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
  'Given a stale-PID lock in the worktree, when teardown runs, then it reports stale lock auto-cleared and removes the worktree',
  () => {
    const dirs = setup();
    try {
      // A reaped child PID is provably dead — more reliable than a fixed high number.
      const child = spawnSync('sh', ['-c', 'exit 0']);
      const deadPid = child.pid;
      const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      const lockPath = path.join(dirs.wt, '.craft-validation.lock');
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
  'Given a lock whose PID is -1 (kill -0 -1 signals a process group), when teardown runs, then the numeric guard treats it as stale, not live',
  () => {
    const dirs = setup();
    try {
      const lockPath = path.join(dirs.wt, '.craft-validation.lock');
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
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-same-'));
    try {
      git(['init', '-q', repo]);
      git(['-C', repo, 'config', 'user.email', 'test@craft']);
      git(['-C', repo, 'config', 'user.name', 'craft-test']);
      git(['-C', repo, 'commit', '--allow-empty', '-q', '-m', 'init']);
      git(['-C', repo, 'branch', '-M', 'main']);
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
