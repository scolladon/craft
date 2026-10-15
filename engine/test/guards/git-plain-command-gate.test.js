import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitPlainCommandGate } from '../../src/guards/git-plain-command-gate.js';

const REASON = 'craft: command too complex to verify near git — spell it plainly';

const COMPLEX_COMMANDS = [
  'shopt -s extglob\n/x/@(git) push origin main',
  'git @(push) origin',
  'echo $[1<<2]\ngit push origin main',
  'export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.st GIT_CONFIG_VALUE_0=push; git st origin main',
  "C=-c; bash $C 'git push origin main'",
  "bash -c 'git status'",
  '{$(:),git,push} origin main',
  'G=git V=push; command $G $V origin main',
  "git log --grep 'x' | xargs echo",
  'git diff > out.txt < in.txt',
  'git log # comment',
  'git commit -m "fix \\"q\\""',
  'git commit -m "it\'s $HOME"',
  'git commit -m "unterminated',
  "git commit -m 'unterminated",
  'git status; "bash" x',
  'git status; /bin/sh x',
  'git status; git_config_x=1 true GiT_CoNfIg_x',
  'git commit -m "$(cat <<\'EOF\'\nx\nEOF\n)"; $(git push)',
  'git commit -m "$(cat <<-\'EOF\'\nx\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nx\nEOF)"',
];

const PLAIN_COMMANDS = [
  'git status',
  'git status --short && git log --oneline -5',
  'git -C ../wt status',
  'git add -A && git commit -m "feat(guards): x — y"',
  "git commit -m 'feat(guards): it works'",
  'git commit -m "$(cat <<\'EOF\'\nfeat(x): don\'t break (really)\n\nbody with $VAR and `ticks`\nEOF\n)"',
  'git log --oneline -5 | head -3',
  'git diff --no-ext-diff HEAD~1 > /tmp/d.txt 2>&1',
  'git worktree add ../x -b feat/y',
  'git branch -d feat/x',
  'git rev-parse HEAD^',
  'git log HEAD~3..HEAD',
  'git show --no-ext-diff HEAD:README.md',
  'ls -la && node --test x.js',
  'npm --prefix engine test 2>&1 | tail -5',
];

describe('gitPlainCommandGate() — complex commands near git', () => {
  for (const command of COMPLEX_COMMANDS) {
    it(`Given ${JSON.stringify(command)}, when gated, then blocks with the fixed reason`, () => {
      const sut = gitPlainCommandGate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON });
    });
  }
});

describe('gitPlainCommandGate() — plain commands', () => {
  for (const command of PLAIN_COMMANDS) {
    it(`Given ${JSON.stringify(command)}, when gated, then passes`, () => {
      const sut = gitPlainCommandGate;

      const result = sut(command);

      assert.deepEqual(result, { block: false });
    });
  }

  it('Given a complex command without git, when gated, then the gate is not triggered', () => {
    const sut = gitPlainCommandGate;

    const result = sut('echo $(date) `id`');

    assert.deepEqual(result, { block: false });
  });
});

describe('gitPlainCommandGate() — linear time', () => {
  it('Given a 131072-char adversarial input, when gated, then it answers well under a second', () => {
    const sut = gitPlainCommandGate;
    const input = `git ${"'\"".repeat(65534)}`;

    const start = performance.now();
    sut(input);
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 1000, `took ${elapsed}ms`);
  });
});
