'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bindRun, createRunRepo, writeTranscript } = require('./helpers/craft-run');

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

// ---------------------------------------------------------------------------
// compaction hooks — SessionStart(compact) registration and bound-run lookup
// ---------------------------------------------------------------------------

const COMPACTION_HOOKS = ['reorient-after-compact.sh'];

function runHookWithPayload(hookName, payload, envOverrides = {}) {
  const hookPath = path.join(HOOKS_DIR, hookName);
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  Object.assign(env, envOverrides);

  const result = spawnSync('/bin/bash', [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env,
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function compactionPayload({ transcriptPath, cwd } = {}) {
  return {
    session_id: 'sess-fixture',
    transcript_path: transcriptPath,
    cwd,
    hook_event_name: 'SessionStart',
    source: 'compact',
  };
}

test(
  'Given hooks/hooks.json, when parsed, then SessionStart binds "compact" to an existing, executable reorient hook',
  () => {
    const hooksConfig = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8'));
    const sut = hooksConfig.hooks.SessionStart[0];

    const hookPath = sut.hooks[0].command.replace('${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}', ROOT);
    const stats = fs.statSync(hookPath);

    assert.strictEqual(sut.matcher, 'compact');
    assert.ok(stats.isFile(), `expected ${hookPath} to be a regular file`);
    assert.notStrictEqual(stats.mode & fs.constants.S_IXUSR, 0, `expected ${hookPath} to be executable`);
  },
);

test('Given hooks/hooks.json, when parsed, then PreToolUse is unchanged', () => {
  const hooksConfig = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8'));
  const result = hooksConfig.hooks.PreToolUse;

  assert.deepStrictEqual(result, [
    {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh' }],
    },
  ]);
});

for (const hookName of COMPACTION_HOOKS) {
  test(`Given a non-git cwd, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-')));
    try {
      const transcriptPath = writeTranscript(dir, ['unrelated']);
      const sut = runHookWithPayload;

      const result = sut(hookName, compactionPayload({ transcriptPath, cwd: dir }));

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`Given a git repo with no .claude/craft-runs/, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const { main, cleanup } = createRunRepo();
    try {
      const transcriptPath = writeTranscript(main, ['unrelated']);
      const sut = runHookWithPayload;

      const result = sut(hookName, compactionPayload({ transcriptPath, cwd: main }));

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
    } finally {
      cleanup();
    }
  });

  test(`Given a transcript that lacks this run's key, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const bound = bindRun();
    try {
      const staleTranscript = writeTranscript(bound.parent, ['no matching run-key in here']);
      const sut = runHookWithPayload;

      const result = sut(hookName, compactionPayload({ transcriptPath: staleTranscript, cwd: bound.worktree }));

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
    } finally {
      bound.cleanup();
    }
  });

  test(`Given a torn-down ledger, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const bound = bindRun();
    try {
      fs.rmSync(bound.ledgerPath);
      const sut = runHookWithPayload;

      const result = sut(hookName, compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
    } finally {
      bound.cleanup();
    }
  });

  test(`Given a payload without transcript_path, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const bound = bindRun();
    try {
      const sut = runHookWithPayload;

      const result = sut(hookName, compactionPayload({ cwd: bound.worktree }));

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
    } finally {
      bound.cleanup();
    }
  });

  test(`Given transcript_path naming a missing file, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const bound = bindRun();
    try {
      const missingTranscript = path.join(bound.parent, 'does-not-exist.jsonl');
      const sut = runHookWithPayload;

      const result = sut(hookName, compactionPayload({ transcriptPath: missingTranscript, cwd: bound.worktree }));

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
    } finally {
      bound.cleanup();
    }
  });

  test(`Given PATH set to an empty temp dir, when ${hookName} runs, then it prints nothing, exits 0 and names jq on stderr`, () => {
    const emptyPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-empty-path-')));
    try {
      const sut = runHookWithPayload;

      const result = sut(
        hookName,
        compactionPayload({ transcriptPath: '/nonexistent-transcript.jsonl', cwd: '/tmp' }),
        { PATH: emptyPath },
      );

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
      const stderrLines = result.stderr.trim().split('\n');
      assert.strictEqual(stderrLines.length, 1);
      assert.match(stderrLines[0], /jq/);
    } finally {
      fs.rmSync(emptyPath, { recursive: true, force: true });
    }
  });
}

test(
  'Given a bound run whose ledger is unreadable, when reorient-after-compact runs, then it never blocks and reports the failure on stderr',
  { skip: process.getuid && process.getuid() === 0 },
  () => {
    const bound = bindRun();
    try {
      fs.chmodSync(bound.ledgerPath, 0o000);
      const sut = runHookWithPayload;

      const result = sut(
        'reorient-after-compact.sh',
        compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
      );

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
      assert.match(result.stderr.trim(), /^craft reorient-after-compact: failed \(exit \d+\)$/);
    } finally {
      bound.cleanup();
    }
  },
);

test(
  "Given a bound run's ledger lines from this run and from another, when reorient-after-compact runs, then it prints the reorient block scoped to this run's tail",
  () => {
    const bound = bindRun({
      ledgerLines: [
        'demo resolve RESOLVE: --profile lean',
        'demo resolve AWAITING(propose): validation',
        'demo design PHASE-START(design): 2026-09-22T10:05:00Z',
        'other design PHASE-START(design): 2026-09-21T09:00:00Z',
      ],
    });
    try {
      const sut = runHookWithPayload;

      const result = sut(
        'reorient-after-compact.sh',
        compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
      );
      const lines = result.stdout.split('\n');
      const repoRoot = fs.realpathSync(ROOT);

      assert.strictEqual(result.status, 0);
      assert.match(lines[0], /^craft reorient — if you are not the craft orchestrator driving run demo\b/);
      assert.ok(lines.includes(`Ledger: ${bound.ledgerPath}`));
      assert.ok(result.stdout.includes(`node ${repoRoot}/engine/bin/run-state.js ${bound.ledgerPath} --run demo`));
      assert.ok(result.stdout.includes('demo resolve RESOLVE: --profile lean'));
      assert.ok(!lines.some((line) => line.startsWith('other ')));
      assert.ok(result.stdout.includes('Ledger tail (last 3 of 3 lines of run demo):'));
    } finally {
      bound.cleanup();
    }
  },
);

test(
  'Given a payload without cwd and CLAUDE_PROJECT_DIR set to the worktree, when reorient-after-compact runs, then the same reorient block is printed',
  () => {
    const bound = bindRun({
      ledgerLines: [
        'demo resolve RESOLVE: --profile lean',
        'demo resolve AWAITING(propose): validation',
        'demo design PHASE-START(design): 2026-09-22T10:05:00Z',
        'other design PHASE-START(design): 2026-09-21T09:00:00Z',
      ],
    });
    try {
      const sut = runHookWithPayload;

      const result = sut(
        'reorient-after-compact.sh',
        compactionPayload({ transcriptPath: bound.transcriptPath }),
        { CLAUDE_PROJECT_DIR: bound.worktree },
      );

      assert.strictEqual(result.status, 0);
      assert.ok(result.stdout.includes(`Ledger: ${bound.ledgerPath}`));
      assert.ok(result.stdout.includes('Ledger tail (last 3 of 3 lines of run demo):'));
    } finally {
      bound.cleanup();
    }
  },
);

test(
  'Given 500 ledger lines of 1,000 characters each, when reorient-after-compact runs, then the tail is capped at 30 lines of at most 200 characters',
  () => {
    const ledgerLines = Array.from({ length: 500 }, (_, i) => `demo phase-${i} ${'x'.repeat(1000)}`);
    const bound = bindRun({ ledgerLines });
    try {
      const sut = runHookWithPayload;

      const result = sut(
        'reorient-after-compact.sh',
        compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
      );
      const header = 'Ledger tail (last 30 of 500 lines of run demo):';
      const headerIndex = result.stdout.indexOf(header);
      const tailLines = result.stdout
        .slice(headerIndex + header.length)
        .split('\n')
        .filter(Boolean);

      assert.strictEqual(result.status, 0);
      assert.ok(result.stdout.length <= 8000, `expected output <= 8000 chars, got ${result.stdout.length}`);
      assert.notStrictEqual(headerIndex, -1);
      assert.strictEqual(tailLines.length, 30);
      assert.ok(tailLines.every((line) => line.length <= 200));
    } finally {
      bound.cleanup();
    }
  },
);
