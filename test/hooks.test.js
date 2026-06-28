'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HOOKS_DIR = path.join(ROOT, 'hooks');
const HOOK_FIXTURES = path.join(__dirname, 'fixtures', 'hooks');

function runHook(hookName, fixtureName) {
  const hookPath = path.join(HOOKS_DIR, hookName);
  const fixturePath = path.join(HOOK_FIXTURES, fixtureName);
  const input = fs.readFileSync(fixturePath);
  try {
    const stdout = execFileSync('bash', [hookPath], {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: stdout.trim() };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: (err.stdout ?? '').trim(),
      stderr: (err.stderr ?? '').trim(),
    };
  }
}

function decision(hookName, fixtureName) {
  const r = runHook(hookName, fixtureName);
  if (r.status !== 0) {
    throw new Error(`Hook exited ${r.status}: ${r.stderr ?? ''}`);
  }
  if (!r.stdout) return '';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

function reason(hookName, fixtureName) {
  const r = runHook(hookName, fixtureName);
  if (r.status !== 0) {
    throw new Error(`Hook exited ${r.status}: ${r.stderr ?? ''}`);
  }
  if (!r.stdout) return '';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason;
}

// ---------------------------------------------------------------------------
// git-no-ext-diff.sh — deny matrix
// ---------------------------------------------------------------------------

test(
  'Given git diff HEAD~1 without --no-ext-diff, when git-no-ext-diff runs, then it denies',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-deny-diff.json'), 'deny');
  },
);

test(
  'Given git diff HEAD~1 without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command',
  () => {
    const r = reason('git-no-ext-diff.sh', 'no-ext-diff-deny-diff.json');
    assert.ok(r.includes('git diff --no-ext-diff HEAD~1'), `Expected corrected command in reason:\n${r}`);
  },
);

test(
  'Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then it denies',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-deny-global-opts.json'), 'deny');
  },
);

test(
  'Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command',
  () => {
    const r = reason('git-no-ext-diff.sh', 'no-ext-diff-deny-global-opts.json');
    assert.ok(r.includes('git -C /x show --no-ext-diff abc'), `Expected corrected command in reason:\n${r}`);
  },
);

test(
  'Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then it denies',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-deny-c-opt.json'), 'deny');
  },
);

test(
  'Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then reason contains corrected command',
  () => {
    const r = reason('git-no-ext-diff.sh', 'no-ext-diff-deny-c-opt.json');
    assert.ok(r.includes('git -c core.pager=cat diff --no-ext-diff HEAD'), `Expected corrected command in reason:\n${r}`);
  },
);

test(
  'Given git --git-dir=... diff without --no-ext-diff, when git-no-ext-diff runs, then it denies',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-deny-gitdir.json'), 'deny');
  },
);

test(
  'Given git --work-tree=... diff without --no-ext-diff, when git-no-ext-diff runs, then it denies',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-deny-worktree.json'), 'deny');
  },
);

// ---------------------------------------------------------------------------
// git-no-ext-diff.sh — allow matrix
// ---------------------------------------------------------------------------

test(
  'Given git diff --no-ext-diff x (already compliant), when git-no-ext-diff runs, then it allows (empty output)',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-allow-compliant.json'), '');
  },
);

test(
  'Given git stash show, when git-no-ext-diff runs, then it allows (empty output)',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-allow-stash.json'), '');
  },
);

test(
  'Given git show-ref, when git-no-ext-diff runs, then it allows (empty output)',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-allow-showref.json'), '');
  },
);

test(
  'Given git difftool, when git-no-ext-diff runs, then it allows (empty output)',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-allow-difftool.json'), '');
  },
);

test(
  'Given rtk proxy git diff, when git-no-ext-diff runs, then it allows (empty output)',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-allow-rtk.json'), '');
  },
);
