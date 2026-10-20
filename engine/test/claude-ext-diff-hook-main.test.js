import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOW_VERDICT, main } from '../src/claude-ext-diff-hook-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EXT_DIFF_REASON = 'craft: git diff/show must carry --no-ext-diff (external diff mangles parsed output)';
const CONFIG_CHANNEL_REASON = 'craft: git config injected outside -c is denied in this binding';
const UNTERMINATED_SUBSTITUTION_REASON = 'craft: command not parseable (unterminated substitution) \u2014 denied fail-closed';
const INLINE_ALIAS_REASON = 'craft: an inline git alias (-c alias.*) is denied \u2014 it can run any git verb';
const OVER_LIMIT_REASON = "craft: command not parseable (longer than the guard's limit) \u2014 denied fail-closed";
// past the tokeniser's 131 072-character cap
const OVER_LIMIT_PADDING = 131_100;
const UNREADABLE_EXIT = 1;

function ioReading(stdinText) {
  const io = makeCaptureIo();
  io.readStdin = () => stdinText;
  return io;
}

const ioFor = command => ioReading(JSON.stringify({ tool_input: { command } }));

function denyOf(io) {
  return JSON.parse(io.stdout.joined()).hookSpecificOutput;
}

const DENIED_FORMS = [
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
  { label: 'a later --ext-diff overriding the marker', command: 'git diff --no-ext-diff --ext-diff' },
];

const ALLOWED_FORMS = [
  { label: 'a compliant diff', command: 'git diff --no-ext-diff HEAD' },
  { label: 'a proxied raw diff', command: 'rtk proxy git diff' },
  { label: 'git stash show', command: 'git stash show' },
  { label: 'git show-ref', command: 'git show-ref' },
  { label: 'git difftool', command: 'git difftool' },
  { label: 'git status', command: 'git status' },
  { label: 'diff text inside an echo string', command: 'echo "a; git diff x"' },
  { label: 'diff text inside a commit message', command: 'git commit -m "wip; git diff fix"' },
  { label: 'show text inside a log grep pattern', command: 'git log --grep "x; git show y"' },
  { label: 'show text inside a quoted heredoc body', command: "cat > notes.md <<'EOF'\nrun it; git show HEAD\nEOF" },
  { label: 'the heredoc commit idiom', command: "git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit diff here\nEOF\n)\"" },
  { label: 'a for loop without git', command: 'for f in *.js; do echo $f; done' },
  { label: 'a piped test run', command: 'npm test 2>&1 | tail -5' },
];

describe('claude ext-diff hook main - denied shell forms', () => {
  for (const { label, command } of DENIED_FORMS) {
    it(`Given ${label} running git diff, when main judges the payload, then it exits 0 and writes the ext-diff deny`, () => {
      const io = ioFor(command);
      const sut = main;

      const result = sut([], io);

      assert.equal(result, 0);
      assert.deepEqual(denyOf(io), { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: EXT_DIFF_REASON });
      assert.equal(io.stderr.joined(), '');
    });
  }
});

describe('claude ext-diff hook main - allowed commands', () => {
  for (const { label, command } of ALLOWED_FORMS) {
    it(`Given ${label}, when main judges the payload, then it exits 0 and writes exactly the allow token`, () => {
      const io = ioFor(command);
      const sut = main;

      const result = sut([], io);

      assert.equal(result, 0);
      assert.equal(io.stdout.joined(), 'allow');
      assert.equal(io.stderr.joined(), '');
    });
  }

  it('Given the exported allow token, when read, then it is the bare word the hook matches', () => {
    const sut = ALLOW_VERDICT;

    assert.equal(sut, 'allow');
  });
});

describe('claude ext-diff hook main - reason prefix', () => {
  for (const { label, command, reason } of [
    { label: 'a config channel assignment', command: 'GIT_CONFIG_COUNT=1 git status', reason: CONFIG_CHANNEL_REASON },
    { label: 'an unterminated substitution', command: 'echo "$(', reason: UNTERMINATED_SUBSTITUTION_REASON },
    { label: 'an inline alias for diff', command: 'git -c alias.d=diff d', reason: INLINE_ALIAS_REASON },
    {
      label: 'a non-diff verb enabling the external diff',
      command: 'git log -p -1 --ext-diff',
      reason: 'craft: --ext-diff is denied on every git verb (external diff mangles parsed output)',
    },
    {
      label: 'a git config alias write',
      command: 'git config alias.x diff',
      reason: 'craft: git config naming an alias or include key is denied \u2014 an alias can run any git verb',
    },
    { label: 'a command over the length cap', command: `git diff ${'x'.repeat(OVER_LIMIT_PADDING)}`, reason: OVER_LIMIT_REASON },
  ]) {
    it(`Given ${label}, when main judges the payload, then the engine reason keeps its single craft prefix`, () => {
      const io = ioFor(command);
      const sut = main;

      sut([], io);

      assert.equal(denyOf(io).permissionDecisionReason, reason);
    });
  }
});

describe('claude ext-diff hook main - payload shapes', () => {
  for (const { label, stdinText } of [
    { label: 'a payload without tool_input', stdinText: '{}' },
    { label: 'a null tool_input', stdinText: '{"tool_input":null}' },
    { label: 'a payload without command', stdinText: '{"tool_input":{}}' },
    { label: 'a null command', stdinText: '{"tool_input":{"command":null}}' },
    { label: 'an empty command', stdinText: '{"tool_input":{"command":""}}' },
    { label: 'a null payload', stdinText: 'null' },
  ]) {
    it(`Given ${label}, when main judges it, then it exits 0 and writes the allow token`, () => {
      const io = ioReading(stdinText);
      const sut = main;

      const result = sut([], io);

      assert.equal(result, 0);
      assert.equal(io.stdout.joined(), 'allow');
    });
  }

  for (const { label, stdinText } of [
    { label: 'a numeric command', stdinText: '{"tool_input":{"command":5}}' },
    { label: 'a false command', stdinText: '{"tool_input":{"command":false}}' },
    { label: 'a string tool_input', stdinText: '{"tool_input":"git diff"}' },
    { label: 'an array tool_input', stdinText: '{"tool_input":["git diff"]}' },
    { label: 'a string payload', stdinText: '"git diff"' },
    { label: 'an array payload', stdinText: '[{"tool_input":{"command":"git diff"}}]' },
  ]) {
    it(`Given ${label}, when main judges it, then it exits 1, names the shape on stderr and writes no verdict`, () => {
      const io = ioReading(stdinText);
      const sut = main;

      const result = sut([], io);

      assert.equal(result, UNREADABLE_EXIT);
      assert.equal(io.stdout.joined(), '');
      assert.match(io.stderr.joined(), /^claude-ext-diff-verdict: tool_input\.command is not a string/);
    });
  }

  for (const { label, stdinText } of [
    { label: 'stdin that is not JSON', stdinText: 'not json' },
    { label: 'two JSON documents', stdinText: '{"tool_input":{"command":"git diff"}} {"tool_input":{"command":"ls"}}' },
    { label: 'empty stdin', stdinText: '' },
  ]) {
    it(`Given ${label}, when main judges it, then it throws a SyntaxError and writes no verdict`, () => {
      const io = ioReading(stdinText);
      const sut = () => main([], io);

      assert.throws(sut, SyntaxError);
      assert.equal(io.stdout.joined(), '');
    });
  }
});
