'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bindRun, createRunRepo, runLedger, writeTranscript } = require('./helpers/craft-run');

const ROOT = path.join(__dirname, '..');
const HOOKS_DIR = path.join(ROOT, 'hooks');
const HOOK_FIXTURES = path.join(__dirname, 'fixtures', 'hooks');
const EXT_DIFF_DENY_REASON = 'craft: git diff/show must carry --no-ext-diff (external diff mangles parsed output)';

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
  'Given git diff HEAD~1 without --no-ext-diff, when git-no-ext-diff runs, then the reason is the engine ext-diff reason',
  () => {
    const sut = reason;

    const result = sut('git-no-ext-diff.sh', 'no-ext-diff-deny-diff.json');

    assert.strictEqual(result, EXT_DIFF_DENY_REASON);
  },
);

test(
  'Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then it denies',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-deny-global-opts.json'), 'deny');
  },
);

test(
  'Given git -C /x show abc without --no-ext-diff, when git-no-ext-diff runs, then the reason is the engine ext-diff reason',
  () => {
    const sut = reason;

    const result = sut('git-no-ext-diff.sh', 'no-ext-diff-deny-global-opts.json');

    assert.strictEqual(result, EXT_DIFF_DENY_REASON);
  },
);

test(
  'Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then it denies',
  () => {
    assert.strictEqual(decision('git-no-ext-diff.sh', 'no-ext-diff-deny-c-opt.json'), 'deny');
  },
);

test(
  'Given git -c <k=v> diff without --no-ext-diff, when git-no-ext-diff runs, then the reason is the engine ext-diff reason',
  () => {
    const sut = reason;

    const result = sut('git-no-ext-diff.sh', 'no-ext-diff-deny-c-opt.json');

    assert.strictEqual(result, EXT_DIFF_DENY_REASON);
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
// git-no-ext-diff.sh — a crash still denies
// ---------------------------------------------------------------------------

const GIT_HOOK = path.join(HOOKS_DIR, 'git-no-ext-diff.sh');
const DENY_DIFF_PAYLOAD = fs.readFileSync(path.join(HOOK_FIXTURES, 'no-ext-diff-deny-diff.json'));
const ALLOW_COMPLIANT_PAYLOAD = fs.readFileSync(path.join(HOOK_FIXTURES, 'no-ext-diff-allow-compliant.json'));
const CRASH_DENY_EXIT_CODE = 2;
const COMMAND_NOT_FOUND_STATUS = 127;
const NODE_UNCAUGHT_ERROR_STATUS = 1;
const SIGKILL_EXIT_STATUS = 137;
const FEED_NEVER_RAN_STATUS = 1;
// enough descriptors for bash to start the hook, too few to open a command-substitution pipe
const TOO_FEW_FILE_DESCRIPTORS = 5;
// 'echo pad\n' × 14000 = 126,000 bytes: about 60 KiB past the 64 KiB pipe buffer, still under
// the 131,072-character limit past which the engine refuses to parse a command
const PIPE_BUFFER_OVERFLOW_LINES = 14000;
const ANY_CRAFT_DENY_REASON = /^craft git-no-ext-diff: .*, call denied$/m;
const NO_VERDICT_REASON = /^craft git-no-ext-diff: no verdict reached, call denied$/m;
const STUB_MODE = 0o755;
const SYNTAX_ERROR_LINE = 'if then fi';
const SIGNAL_EXIT_STATUS = { SIGTERM: 143, SIGHUP: 129 };
const CHILD_POLL_TIMEOUT_MS = 5000;
const CHILD_POLL_INTERVAL_MS = 20;
// every directory bash may pick for a here-document temp file, the cwd included
const NO_TEMP_WRITE_PROFILE = [
  '(version 1)(allow default)(deny file-write*',
  '(subpath "/private/tmp") (subpath "/private/var") (subpath "/tmp") (subpath "/var"))',
].join(' ');

function crashReason(status) {
  return new RegExp(`^craft git-no-ext-diff: failed \\(exit ${status}\\), call denied$`, 'm');
}

function resolveTool(name) {
  const hit = process.env.PATH.split(path.delimiter)
    .map((dir) => path.join(dir, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!hit) throw new Error(`${name} is not on PATH`);
  return hit;
}

// PATH holding only the named tools, so the hook crashes on the first one it lacks
function withToolsOnly(tools, act) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-tools-')));
  try {
    for (const tool of tools) fs.symlinkSync(resolveTool(tool), path.join(dir, tool));
    return act(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runGitHook(input, env = process.env) {
  return spawnSync('/bin/bash', [GIT_HOOK], { input, encoding: 'utf8', env });
}

function runGitHookOnCommand(command) {
  return runGitHook(JSON.stringify({ tool_input: { command } }));
}

// PATH holding only a `node` stub with the given sh body, so the hook meets that node instead of the real one
function withStubNode(body, act) {
  return withToolsOnly([], (toolsDir) => {
    fs.writeFileSync(path.join(toolsDir, 'node'), `#!/bin/sh\n${body}\n`, { mode: STUB_MODE });
    return act(toolsDir);
  });
}

// copy of the hook with one line inserted after the first line starting with `anchor`, laid out
// beside a link to the real engine so the copy still reaches its verdict
function withHookCopy({ anchor, inserted }, act) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-copy-')));
  try {
    const lines = fs.readFileSync(GIT_HOOK, 'utf8').split('\n');
    const at = lines.findIndex((line) => line.startsWith(anchor));
    if (at === -1) throw new Error(`no line starts with ${anchor}`);
    lines.splice(at + 1, 0, inserted);
    fs.mkdirSync(path.join(dir, 'hooks'));
    fs.symlinkSync(path.join(ROOT, 'engine'), path.join(dir, 'engine'));
    const copy = path.join(dir, 'hooks', 'git-no-ext-diff.sh');
    fs.writeFileSync(copy, lines.join('\n'));
    return act(spawnSync('/bin/bash', [copy], { input: DENY_DIFF_PAYLOAD, encoding: 'utf8' }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// The hook forks its first child only after its traps are set, so a child is the cue that a
// signal now meets the traps rather than bash's default disposition.
function waitForFirstChild(pid) {
  const deadline = Date.now() + CHILD_POLL_TIMEOUT_MS;
  while (spawnSync('pgrep', ['-P', String(pid)]).status !== 0) {
    if (Date.now() > deadline) throw new Error(`no child of ${pid} within ${CHILD_POLL_TIMEOUT_MS} ms`);
    sleepMs(CHILD_POLL_INTERVAL_MS);
  }
}

function runGitHookSignalledWhileReading(signal) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [GIT_HOOK]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    try {
      waitForFirstChild(child.pid);
    } catch (err) {
      // the hook would otherwise block on its open stdin and keep the test process alive
      child.kill('SIGKILL');
      child.stdin.destroy();
      reject(err);
      return;
    }
    child.kill(signal);
    child.stdin.end(DENY_DIFF_PAYLOAD);
  });
}

function assertCrashDeny(result, status) {
  assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
  assert.match(result.stderr, crashReason(status));
  assert.strictEqual(result.stdout, '');
}

test('Given a compliant command, when git-no-ext-diff runs, then it exits 0 with empty stdout and stderr', () => {
  const sut = runGitHook;
  const result = sut(ALLOW_COMPLIANT_PAYLOAD);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(result.stderr, '');
});

test('Given a git diff without --no-ext-diff, when git-no-ext-diff runs, then stderr stays empty beside the JSON deny', () => {
  const sut = runGitHook;
  const result = sut(DENY_DIFF_PAYLOAD);
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stderr, '');
  assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('Given PATH holding every tool but node, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
  withToolsOnly(['cat', 'jq', 'grep', 'sed'], (toolsDir) => {
    const sut = runGitHook;
    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
    assertCrashDeny(result, COMMAND_NOT_FOUND_STATUS);
  });
});

test('Given a node that exits 0 without printing, when git-no-ext-diff runs, then it exits 2 with no verdict reached', () => {
  withStubNode('exit 0', (toolsDir) => {
    const sut = runGitHook;
    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
    assert.match(result.stderr, NO_VERDICT_REASON);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a node that prints an unknown token, when git-no-ext-diff runs, then it exits 2 with no verdict reached', () => {
  withStubNode("printf 'maybe'", (toolsDir) => {
    const sut = runGitHook;
    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
    assert.match(result.stderr, NO_VERDICT_REASON);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a node that prints a truncated deny token, when git-no-ext-diff runs, then it exits 2 with no verdict reached', () => {
  withStubNode("printf '{\"hookSpecificOutput\":junk'", (toolsDir) => {
    const sut = runGitHook;
    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
    assert.match(result.stderr, NO_VERDICT_REASON);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given the hook reached through a symlink in another directory, when it runs on a git diff, then it denies with the engine reason', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-link-')));
  try {
    const link = path.join(dir, 'git-no-ext-diff.sh');
    fs.symlinkSync(GIT_HOOK, link);
    const sut = () => spawnSync('/bin/bash', [link], { input: DENY_DIFF_PAYLOAD, encoding: 'utf8' });
    const result = sut();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, EXT_DIFF_DENY_REASON);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a node that prints the allow token with a trailing newline, when git-no-ext-diff runs, then it exits 2 with no verdict reached', () => {
  withStubNode("printf 'allow\\n'", (toolsDir) => {
    const sut = runGitHook;
    const result = sut(ALLOW_COMPLIANT_PAYLOAD, { PATH: toolsDir });
    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
    assert.match(result.stderr, NO_VERDICT_REASON);
  });
});

test('Given a node killed by SIGKILL, when git-no-ext-diff runs, then it exits 2 with the signal status as the crash reason', () => {
  withStubNode('kill -9 $$', (toolsDir) => {
    const sut = runGitHook;
    const result = sut(DENY_DIFF_PAYLOAD, { PATH: toolsDir });
    assertCrashDeny(result, SIGKILL_EXIT_STATUS);
  });
});

test('Given a NODE_OPTIONS preload that throws, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-preload-')));
  try {
    const preload = path.join(dir, 'throws.cjs');
    fs.writeFileSync(preload, "throw new Error('preload refused');\n");
    const sut = runGitHook;
    const result = sut(DENY_DIFF_PAYLOAD, { ...process.env, NODE_OPTIONS: `--require ${preload}` });
    assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Given stdin that is not JSON, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
  const sut = runGitHook;
  const result = sut('not json');
  assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
  assert.match(result.stderr, /SyntaxError/);
});

test('Given a numeric command, when git-no-ext-diff runs, then it exits 2 with the crash reason on stderr', () => {
  const sut = runGitHook;
  const result = sut('{"tool_input":{"command":5}}');
  assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
  assert.match(result.stderr, /^claude-ext-diff-verdict: tool_input\.command is not a string/m);
});

test('Given PATH without node and stderr closed, when git-no-ext-diff runs, then it still exits 2', () => {
  withToolsOnly([], (toolsDir) => {
    const sut = () => spawnSync('/bin/bash', ['-c', '/bin/bash "$0" 2>&-', GIT_HOOK], {
      input: DENY_DIFF_PAYLOAD,
      encoding: 'utf8',
      env: { PATH: toolsDir },
    });
    const result = sut();
    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a matching git diff followed by more than a pipe buffer of lines, when git-no-ext-diff runs, then it denies with the engine reason', () => {
  const command = `git diff HEAD\n${'echo pad\n'.repeat(PIPE_BUFFER_OVERFLOW_LINES)}`;
  const sut = runGitHook;
  const result = sut(JSON.stringify({ tool_input: { command } }));
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.stderr, '');
  assert.notStrictEqual(result.stdout, '', 'expected a JSON deny on stdout, got an allow');
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.strictEqual(output.permissionDecision, 'deny');
  assert.strictEqual(output.permissionDecisionReason, EXT_DIFF_DENY_REASON);
});

test('Given an unmodified hook copy beside the engine, when it runs, then it denies with the engine reason', () => {
  const sut = withHookCopy;
  sut({ anchor: 'set -euo pipefail', inserted: ':' }, (result) => {
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, EXT_DIFF_DENY_REASON);
  });
});

test('Given a hook copy with a syntax error right below its trap, when it runs, then it exits 2 with a craft reason', () => {
  const sut = withHookCopy;
  sut({ anchor: 'trap ', inserted: SYNTAX_ERROR_LINE }, (result) => {
    assert.strictEqual(result.status, CRASH_DENY_EXIT_CODE, result.stderr);
    assert.match(result.stderr, ANY_CRAFT_DENY_REASON);
    assert.strictEqual(result.stdout, '');
  });
});

for (const signal of Object.keys(SIGNAL_EXIT_STATUS)) {
  test(`Given a ${signal} while the hook reads stdin, when git-no-ext-diff runs, then it exits 2 with the signal status as the crash reason`, async () => {
    const sut = runGitHookSignalledWhileReading;
    const result = await sut(signal);
    assertCrashDeny(result, SIGNAL_EXIT_STATUS[signal]);
  });
}

test(
  'Given too few file descriptors for a command substitution, when git-no-ext-diff runs, then it exits 2 with the crash reason',
  { skip: process.platform !== 'darwin' && 'the descriptor floor is only probed on macOS /bin/bash' },
  () => {
    const sut = () => spawnSync('/bin/bash', ['-c', `ulimit -n ${TOO_FEW_FILE_DESCRIPTORS}; exec /bin/bash "$0"`, GIT_HOOK], {
      input: DENY_DIFF_PAYLOAD,
      encoding: 'utf8',
    });
    const result = sut();
    assertCrashDeny(result, FEED_NEVER_RAN_STATUS);
  },
);

test(
  'Given a verdict feed that cannot start once the traps are set, when git-no-ext-diff runs, then it exits 2 with the crash reason',
  { skip: process.platform !== 'darwin' && 'the descriptor floor is only probed on macOS /bin/bash' },
  () => {
    const sut = withHookCopy;
    sut({ anchor: 'readonly VERDICT_BIN=', inserted: `ulimit -n ${TOO_FEW_FILE_DESCRIPTORS - 1}` }, (result) => {
      assertCrashDeny(result, FEED_NEVER_RAN_STATUS);
    });
  },
);

test(
  'Given two JSON documents on stdin with a git diff first, when git-no-ext-diff runs, then it exits 2 with the crash reason',
  () => {
    const sut = runGitHook;
    const result = sut('{"tool_input":{"command":"git diff"}} {"tool_input":{"command":"ls"}}');
    assertCrashDeny(result, NODE_UNCAUGHT_ERROR_STATUS);
    assert.match(result.stderr, /SyntaxError/);
  },
);

test(
  'Given no writable temp directory, when git-no-ext-diff runs on a matching command, then it still denies with the engine reason',
  { skip: process.platform !== 'darwin' && 'sandbox-exec is macOS-only' },
  () => {
    const sut = () => spawnSync('sandbox-exec', ['-p', NO_TEMP_WRITE_PROFILE, '/bin/bash', GIT_HOOK], {
      input: DENY_DIFF_PAYLOAD,
      encoding: 'utf8',
      cwd: fs.realpathSync(os.tmpdir()),
    });
    const result = sut();
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stderr, '');
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.strictEqual(output.permissionDecision, 'deny');
    assert.strictEqual(output.permissionDecisionReason, EXT_DIFF_DENY_REASON);
  },
);

// ---------------------------------------------------------------------------
// git-no-ext-diff.sh — shell forms the engine parses
// ---------------------------------------------------------------------------

const ENGINE_DENIED_FORMS = [
  { label: 'a subshell', command: '(git diff)' },
  { label: 'a brace group', command: '{ git diff; }' },
  { label: 'a subshell after an and-list', command: 'true && (git diff)' },
  { label: 'an assignment prefix', command: 'FOO=1 git diff' },
  { label: 'the env wrapper', command: 'env git diff' },
  { label: 'the command builtin', command: 'command git diff' },
  { label: 'a negation', command: '! git diff' },
  { label: 'the time keyword', command: 'time git diff' },
  { label: 'the --no-pager global', command: 'git --no-pager diff' },
  { label: 'the -p global', command: 'git -p diff' },
  { label: 'a spaced --git-dir global', command: 'git --git-dir .git diff' },
  { label: 'mixed -c and --no-pager globals', command: 'git -c x=y --no-pager diff' },
  { label: 'a quoted git word', command: '"git" diff' },
  { label: 'a string run by sh -c', command: "sh -c 'git diff'" },
  { label: 'the marker in a later command', command: 'git diff; echo --no-ext-diff' },
  { label: 'the proxy text in an earlier command', command: 'echo "rtk proxy"; git diff' },
];

const ENGINE_ALLOWED_FORMS = [
  { label: 'diff text inside an echo string', command: 'echo "a; git diff x"' },
  { label: 'diff text inside a commit message', command: 'git commit -m "wip; git diff fix"' },
  { label: 'show text inside a log grep pattern', command: 'git log --grep "x; git show y"' },
  { label: 'show text inside a quoted heredoc body', command: "cat > notes.md <<'EOF'\nrun it; git show HEAD\nEOF" },
  { label: 'the heredoc commit idiom', command: "git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit diff here\nEOF\n)\"" },
];

for (const { label, command } of ENGINE_DENIED_FORMS) {
  test(`Given ${label} running git diff, when git-no-ext-diff runs, then it denies with the engine reason`, () => {
    const sut = runGitHookOnCommand;

    const result = sut(command);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, EXT_DIFF_DENY_REASON);
  });
}

for (const { label, command } of ENGINE_ALLOWED_FORMS) {
  test(`Given ${label}, when git-no-ext-diff runs, then it allows with empty output`, () => {
    const sut = runGitHookOnCommand;

    const result = sut(command);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
  });
}

test('Given a git config channel assignment, when git-no-ext-diff runs, then it denies with the engine reason under a single craft prefix', () => {
  const sut = runGitHookOnCommand;

  const result = sut('GIT_CONFIG_COUNT=1 git status');

  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(
    JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason,
    'craft: git config injected outside -c is denied in this binding',
  );
});

// ---------------------------------------------------------------------------
// compaction hooks — SessionStart(compact) registration and bound-run lookup
// ---------------------------------------------------------------------------

const COMPACTION_HOOKS = ['reorient-after-compact.sh', 'steer-compact-summary.sh'];

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

function steerPayload({ transcriptPath, cwd } = {}) {
  return {
    session_id: 'sess-fixture',
    transcript_path: transcriptPath,
    cwd,
    hook_event_name: 'PreCompact',
    trigger: 'auto',
    custom_instructions: null,
  };
}

// Each hook is fed the payload of the event it is registered on.
function payloadFor(hookName) {
  return hookName === 'steer-compact-summary.sh' ? steerPayload : compactionPayload;
}

function ledgerFixtureLines(name) {
  const fixturePath = path.join(__dirname, '..', 'engine', 'test', 'fixtures', 'run-ledger', name);
  const [, ...rest] = fs.readFileSync(fixturePath, 'utf8').split('\n');
  return rest.filter((line) => line.trim() !== '');
}

const SPACED_ROOT_PREFIX = 'craft-hook-root-';
const SH_ARGV_DUMP = '; printf "%s\\0" "$@"';
const REGISTERED_HOOKS = [
  { event: 'PreToolUse', script: 'git-no-ext-diff.sh' },
  { event: 'SessionStart', script: 'reorient-after-compact.sh' },
  { event: 'PreCompact', script: 'steer-compact-summary.sh' },
];

function readHooksConfig() {
  return JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, 'hooks.json'), 'utf8'));
}

function registeredCommand(event) {
  const [binding] = readHooksConfig().hooks[event];
  return binding.hooks[0].command;
}

// Expands a registered command the way Claude's runner does: /bin/sh -c with the plugin root in the environment.
function expandHookCommand(command, env) {
  const result = spawnSync('sh', ['-c', `set -- ${command}${SH_ARGV_DUMP}`], { env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`sh exited ${result.status}: ${result.stderr}`);
  return result.stdout.split('\0').filter(Boolean);
}

function withSpacedRoots(act) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), SPACED_ROOT_PREFIX));
  try {
    const roots = { plugin: path.join(tmp, 'plug in root'), override: path.join(tmp, 'alt root') };
    fs.symlinkSync(ROOT, roots.plugin);
    fs.symlinkSync(ROOT, roots.override);
    return act(roots);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function assertExecutableFile(filePath) {
  const stats = fs.statSync(filePath);
  assert.ok(stats.isFile(), `expected ${filePath} to be a regular file`);
  assert.notStrictEqual(stats.mode & fs.constants.S_IXUSR, 0, `expected ${filePath} to be executable`);
}

test(
  'Given hooks/hooks.json, when parsed, then SessionStart binds "compact" to an existing, executable reorient hook',
  () => {
    const sut = readHooksConfig().hooks.SessionStart[0];

    const result = expandHookCommand(sut.hooks[0].command, { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: ROOT });

    assert.strictEqual(sut.matcher, 'compact');
    assert.strictEqual(result.length, 1, result.join('|'));
    assertExecutableFile(result[0]);
  },
);

test(
  'Given hooks/hooks.json, when parsed, then PreCompact binds an empty matcher to an existing, executable steer hook',
  () => {
    const sut = readHooksConfig().hooks.PreCompact[0];

    const result = expandHookCommand(sut.hooks[0].command, { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: ROOT });

    assert.strictEqual(sut.matcher, '');
    assert.strictEqual(result.length, 1, result.join('|'));
    assertExecutableFile(result[0]);
  },
);

test('Given hooks/hooks.json, when parsed, then PreToolUse binds Bash to the quoted git-no-ext-diff command', () => {
  const sut = readHooksConfig();

  const result = sut.hooks.PreToolUse;

  assert.deepStrictEqual(result, [
    {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: '"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/hooks/git-no-ext-diff.sh"' }],
    },
  ]);
});

for (const { event, script } of REGISTERED_HOOKS) {
  test(`Given a plugin root containing a space, when the ${event} command is expanded by sh, then it is one word naming the executable hook under that root`, () => {
    withSpacedRoots(({ plugin }) => {
      const sut = expandHookCommand;

      const result = sut(registeredCommand(event), { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: plugin });

      assert.deepStrictEqual(result, [path.join(plugin, 'hooks', script)]);
      assertExecutableFile(result[0]);
    });
  });

  test(`Given CRAFT_ROOT set to a root containing a space, when the ${event} command is expanded by sh, then CRAFT_ROOT wins`, () => {
    withSpacedRoots(({ plugin, override }) => {
      const sut = expandHookCommand;

      const result = sut(registeredCommand(event), { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: plugin, CRAFT_ROOT: override });

      assert.deepStrictEqual(result, [path.join(override, 'hooks', script)]);
      assertExecutableFile(result[0]);
    });
  });
}

for (const hookName of COMPACTION_HOOKS) {
  test(`Given a non-git cwd, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hook-')));
    try {
      const transcriptPath = writeTranscript(dir, ['unrelated']);
      const sut = runHookWithPayload;

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath, cwd: dir }));

      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.status, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test(`Given a git repo with no run directory, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const { main, cleanup } = createRunRepo();
    try {
      const transcriptPath = writeTranscript(main, ['unrelated']);
      const sut = runHookWithPayload;

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath, cwd: main }));

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

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath: staleTranscript, cwd: bound.worktree }));

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

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

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

      const result = sut(hookName, payloadFor(hookName)({ cwd: bound.worktree }));

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

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath: missingTranscript, cwd: bound.worktree }));

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
        payloadFor(hookName)({ transcriptPath: '/nonexistent-transcript.jsonl', cwd: '/tmp' }),
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

  test(
    `Given a bound run whose ledger is unreadable, when ${hookName} runs, then it never blocks and reports the failure on stderr`,
    { skip: process.getuid && process.getuid() === 0 },
    () => {
      const bound = bindRun();
      try {
        fs.chmodSync(bound.ledgerPath, 0o000);
        const sut = runHookWithPayload;
        const hookLabel = hookName.replace(/\.sh$/, '');

        const result = sut(hookName, payloadFor(hookName)({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

        assert.strictEqual(result.stdout, '');
        assert.strictEqual(result.status, 0);
        assert.match(result.stderr.trim(), new RegExp(`^craft ${hookLabel}: failed \\(exit \\d+\\)$`));
      } finally {
        bound.cleanup();
      }
    },
  );
}

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
      assert.ok(tailLines[0].startsWith('demo phase-470 '), 'the tail starts at the 30th line from the end');
      assert.ok(tailLines[29].startsWith('demo phase-499 '), 'the tail ends at the last line');
      assert.ok(tailLines.every((line) => line.length === 200));
    } finally {
      bound.cleanup();
    }
  },
);

test(
  "Given the mid-review ledger fixture, when steer-compact-summary runs from a worktree cwd, then it prints the compaction note with the review phase in flight",
  () => {
    const bound = bindRun({ ledgerLines: ledgerFixtureLines('mid-review.md') });
    try {
      const sut = runHookWithPayload;

      const result = sut(
        'steer-compact-summary.sh',
        steerPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
      );
      const lines = result.stdout.split('\n').filter((line) => line.length > 0);
      const orchestratorIndex = lines.findIndex((line) => line.startsWith("If it is the craft orchestrator's"));
      const subAgentIndex = lines.findIndex((line) => line.startsWith('If it is a craft sub-agent'));

      assert.strictEqual(result.status, 0);
      assert.match(lines[0], /^craft compaction note: craft run demo\b/);
      assert.ok(orchestratorIndex !== -1 && subAgentIndex !== -1 && orchestratorIndex < subAgentIndex);
      assert.ok(lines[orchestratorIndex].includes('run-id demo;'));
      assert.ok(lines[orchestratorIndex].includes(`ledger ${bound.ledgerPath};`));
      assert.ok(lines[orchestratorIndex].includes('phase(s) in flight: review;'));
      assert.ok(!lines[subAgentIndex].includes(bound.ledgerPath));
      assert.strictEqual(lines[lines.length - 1], 'If neither, ignore this note.');
    } finally {
      bound.cleanup();
    }
  },
);

const STEER_IN_FLIGHT_FIXTURES = [
  { fixture: 'design-revision.md', inFlight: 'design' },
  { fixture: 'parallel.md', inFlight: 'validation, documentation' },
  { fixture: 'resolve-only.md', inFlight: 'none recorded' },
  { fixture: 'mixed-runs.md', inFlight: 'decisions' },
];

for (const { fixture, inFlight } of STEER_IN_FLIGHT_FIXTURES) {
  test(
    `Given the ${fixture} ledger fixture, when steer-compact-summary runs, then phase(s) in flight reads "${inFlight}"`,
    () => {
      const bound = bindRun({ ledgerLines: ledgerFixtureLines(fixture) });
      try {
        const sut = runHookWithPayload;

        const result = sut(
          'steer-compact-summary.sh',
          steerPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
        );

        assert.strictEqual(result.status, 0);
        assert.ok(result.stdout.includes(`phase(s) in flight: ${inFlight};`));
      } finally {
        bound.cleanup();
      }
    },
  );
}

test(
  'Given 500 demo lines of 1,000 characters plus 40 demo PHASE-START lines with 30-character phase names, when steer-compact-summary runs, then output length is bounded and the in-flight list is cut to 200 characters',
  () => {
    const noiseLines = Array.from({ length: 500 }, (_, i) => `demo noise-${i} ${'x'.repeat(1000)}`);
    const phaseLines = Array.from({ length: 40 }, (_, i) => {
      const phase = `p${String(i).padStart(2, '0')}${'a'.repeat(27)}`;
      return `demo ${phase} PHASE-START(${phase}): 2026-09-22T11:00:00Z`;
    });
    const bound = bindRun({ ledgerLines: [...noiseLines, ...phaseLines] });
    try {
      const sut = runHookWithPayload;

      const result = sut(
        'steer-compact-summary.sh',
        steerPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
      );
      const orchestratorLine = result.stdout
        .split('\n')
        .find((line) => line.startsWith("If it is the craft orchestrator's"));
      const match = orchestratorLine && orchestratorLine.match(/phase\(s\) in flight: (.*?);/);

      assert.strictEqual(result.status, 0);
      assert.ok(result.stdout.length <= 2000, `expected output <= 2000 chars, got ${result.stdout.length}`);
      assert.ok(match, 'expected a phase(s) in flight segment in output');
      assert.strictEqual(match[1].length, 200);
    } finally {
      bound.cleanup();
    }
  },
);

test(
  'Given a PHASE-START(implementation) followed by 40 records of the same run, when steer-compact-summary runs, then implementation is still reported in flight',
  () => {
    const partLines = Array.from({ length: 40 }, (_, i) => `demo implementation PART(${i + 1}): abc${i} size=pure-module outcome=pass`);
    const bound = bindRun({
      ledgerLines: ['demo implementation PHASE-START(implementation): 2026-09-22T10:00:00Z', ...partLines],
    });
    try {
      const sut = runHookWithPayload;

      const result = sut('steer-compact-summary.sh', steerPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /phase\(s\) in flight: implementation;/);
    } finally {
      bound.cleanup();
    }
  },
);

test(
  'Given a PHASE-START(design) appended through run-ledger.sh without a time, when steer-compact-summary runs, then design is reported in flight',
  () => {
    const bound = bindRun();
    try {
      runLedger(bound.main, ['append', 'demo', 'design'], 'PHASE-START(design):\n');
      const sut = runHookWithPayload;

      const result = sut('steer-compact-summary.sh', steerPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /phase\(s\) in flight: design;/);
    } finally {
      bound.cleanup();
    }
  },
);

test(
  'Given a PHASE-START(design) appended through run-ledger.sh without a time, when reorient-after-compact runs, then the tail line carries the stamped ISO time',
  () => {
    const bound = bindRun();
    try {
      runLedger(bound.main, ['append', 'demo', 'design'], 'PHASE-START(design):\n');
      const sut = runHookWithPayload;

      const result = sut('reorient-after-compact.sh', compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /demo design PHASE-START\(design\): \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/);
    } finally {
      bound.cleanup();
    }
  },
);

const CONTROL_CHARS = /[\x01-\x08\x0b-\x1f\x7f]/;

test(
  'Given a ledger line carrying an escape sequence and a control character, when reorient-after-compact runs, then its output carries neither',
  () => {
    const bound = bindRun({ ledgerLines: ['demo design note \x1b[31mred\x1b[0m and \x01 bell'] });
    try {
      const sut = runHookWithPayload;

      const result = sut('reorient-after-compact.sh', compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /demo design note \[31mred\[0m and {2}bell/);
      assert.doesNotMatch(result.stdout, CONTROL_CHARS);
    } finally {
      bound.cleanup();
    }
  },
);

test(
  'Given an in-flight phase name carrying an escape sequence, when steer-compact-summary runs, then its output carries no control character',
  () => {
    const bound = bindRun({ ledgerLines: ['demo design PHASE-START(de\x1bsign): 2026-09-22T10:00:00Z'] });
    try {
      const sut = runHookWithPayload;

      const result = sut('steer-compact-summary.sh', steerPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /phase\(s\) in flight: design;/);
      assert.doesNotMatch(result.stdout, CONTROL_CHARS);
    } finally {
      bound.cleanup();
    }
  },
);

for (const hookName of COMPACTION_HOOKS) {
  test(`Given a run with no worktree yet, when ${hookName} runs from the main checkout, then it names the run ledger`, () => {
    const bound = bindRun({ worktree: false });
    try {
      const sut = runHookWithPayload;

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath: bound.transcriptPath, cwd: bound.main }));

      assert.strictEqual(result.status, 0);
      assert.ok(result.stdout.includes(bound.ledgerPath), `expected the ledger path in: ${result.stdout}`);
    } finally {
      bound.cleanup();
    }
  });

  test(`Given a payload cwd that does not exist, when ${hookName} runs, then it prints nothing and exits 0`, () => {
    const bound = bindRun();
    try {
      const sut = runHookWithPayload;

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath: bound.transcriptPath, cwd: path.join(bound.parent, 'gone') }));

      assert.strictEqual(result.status, 0);
      assert.strictEqual(result.stdout, '');
      assert.strictEqual(result.stderr, '', 'an unbound cwd is a silent no-op, not a caught failure');
    } finally {
      bound.cleanup();
    }
  });
}

// Every C1 control and bidi override the strip names, both range endpoints
// included, plus C0 bytes spliced inside sequences so a single pass would
// reassemble what it removed.
const STRIPPED_SEQUENCES = ['\u0080', '\u0085', '\u009b', '\u009d', '\u009f', '‪', '‮', '⁦', '⁩'];
const C1_AND_BIDI = new RegExp(STRIPPED_SEQUENCES.join('|'));
const SPLICED_BYTES = Buffer.from([0x41, 0xc2, 0x01, 0x9b, 0x42, 0xe2, 0x80, 0x01, 0xae, 0x43, 0xc2, 0xc2, 0x9b, 0x9b, 0x44]);

test(
  'Given a ledger line carrying every stripped C1 control and bidi override, when reorient-after-compact runs, then its output carries none of them',
  () => {
    const bound = bindRun({ ledgerLines: [`demo design note ${STRIPPED_SEQUENCES.join('x')} end`] });
    try {
      const sut = runHookWithPayload;

      const result = sut('reorient-after-compact.sh', compactionPayload({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /demo design note x{8} end/);
      assert.doesNotMatch(result.stdout, C1_AND_BIDI);
    } finally {
      bound.cleanup();
    }
  },
);

for (const hookName of COMPACTION_HOOKS) {
  test(`Given C0 bytes spliced inside C1 and bidi sequences in a phase token, when ${hookName} runs, then no sequence is reassembled in its output`, () => {
    const bound = bindRun();
    try {
      fs.appendFileSync(bound.ledgerPath, Buffer.concat([Buffer.from('demo design PHASE-START('), SPLICED_BYTES, Buffer.from('): 2026-09-22T10:05:00Z\n')]));
      const sut = runHookWithPayload;

      const result = sut(hookName, payloadFor(hookName)({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }));

      assert.strictEqual(result.status, 0);
      assert.match(result.stdout, /ABCD/);
      assert.doesNotMatch(result.stdout, C1_AND_BIDI);
    } finally {
      bound.cleanup();
    }
  });
}

// The hooks must keep working under whatever multibyte locale the session
// runs in; this pins that with one the host actually provides.
const AVAILABLE_LOCALES = (spawnSync('locale', ['-a'], { encoding: 'utf8' }).stdout ?? '').split('\n');
const UTF8_LOCALE = ['en_US.UTF-8', 'C.UTF-8', 'en_US.utf8', 'C.utf8'].find((name) => AVAILABLE_LOCALES.includes(name));

for (const hookName of COMPACTION_HOOKS) {
  test(`Given a multibyte UTF-8 locale and a clean ledger, when ${hookName} runs, then it prints its block with no stderr`, () => {
    assert.ok(UTF8_LOCALE, 'expected the host to provide a UTF-8 locale');
    const bound = bindRun({ ledgerLines: ['demo implementation PHASE-START(implementation): 2026-09-22T10:00:00Z'] });
    try {
      const sut = runHookWithPayload;

      const result = sut(
        hookName,
        payloadFor(hookName)({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
        { LC_ALL: UTF8_LOCALE, LANG: UTF8_LOCALE },
      );

      assert.strictEqual(result.status, 0);
      assert.strictEqual(result.stderr, '');
      assert.ok(result.stdout.includes('implementation'), `expected the block, got: ${JSON.stringify(result.stdout)}`);
    } finally {
      bound.cleanup();
    }
  });

  test(`Given a multibyte UTF-8 locale and a phase token holding a byte that is not valid UTF-8, when ${hookName} runs, then it still prints its block`, () => {
    assert.ok(UTF8_LOCALE, 'expected the host to provide a UTF-8 locale');
    const bound = bindRun({ ledgerLines: ['demo implementation PHASE-START(implementation): 2026-09-22T10:00:00Z'] });
    try {
      fs.appendFileSync(bound.ledgerPath, Buffer.from('demo design PHASE-START(caf\xe9): 2026-09-22T10:05:00Z\n', 'latin1'));
      const sut = runHookWithPayload;

      const result = sut(
        hookName,
        payloadFor(hookName)({ transcriptPath: bound.transcriptPath, cwd: bound.worktree }),
        { LC_ALL: UTF8_LOCALE, LANG: UTF8_LOCALE },
      );

      assert.strictEqual(result.status, 0);
      assert.strictEqual(result.stderr, '');
      assert.ok(result.stdout.includes('implementation'), `expected the block, got: ${JSON.stringify(result.stdout)}`);
    } finally {
      bound.cleanup();
    }
  });
}
