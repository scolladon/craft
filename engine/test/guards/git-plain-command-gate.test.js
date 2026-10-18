import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitPlainCommandGate, COMPLEX_NEAR_GIT_REASON as REASON } from '../../src/guards/git-plain-command-gate.js';

const smuggled = line => `git commit -m "$(cat <<'EOF'\nmsg\nEOF\n${line}\nEOF\n)"`;

const COMPLEX_COMMANDS = [
  'caffeinate =bash git-script.sh',
  '=git status',
  'git log; =git push',
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
  "x; sh -c 'git push'",
  'git status | xargs echo',
  'git status && env FOO=1 git status',
  '. ./script.sh; git status',
  'source x; git status',
  'nohup git push',
  "true || eval 'git push'",
  "/bin/bash -c 'git status'",
  "\"bash\" -c 'git status'",
  "FOO=1 bash -c 'git status'",
  ">o bash -c 'git push'",
  smuggled('{$(:),git,push} origin main'),
  smuggled("bash $'-\\x63' 'git push'"),
  smuggled("C=-c; bash $C 'git push'"),
  smuggled('G=git V=push; command $G $V origin main'),
  '"$(cat <<\'EOF\'\nbash\nEOF\n)" -c \'git push\'',
  'git status; "$(cat <<\'EOF\'\nsh\nEOF\n)" -c x',
  'A=1 "$(cat <<\'EOF\'\nsh\nEOF\n)" -c x; git status',
  "trap 'git push origin main' EXIT",
  "PS4='$(git push origin main)'; set -x; true",
  "declare -i n='a[$(git push)]'",
  "typeset -i n='a[$(git push)]'",
  "let 'x=a[$(git push)]'",
  "git status; echo 'a`id`'",
  "2>/dev/null bash -c 'git status'",
  "1>x eval 'git push'",
  '2>>x sh -c x; git status',
  '>&2 bash -c x; git status',
  '2>&1 bash -c x; git status',
  '>|x bash -c x; git status',
  "a+=1 bash -c 'git status'",
  "if true; then bash -c 'git status'; fi",
  "while true; do bash -c 'git status'; break; done",
  'until false; do sh -c x; done; git status',
  'hash -p /tmp/git x; x push origin main',
  "x; zsh -c 'git push'",
  'exec git push',
  'command git push',
  'time git push',
  'sudo git push',
  'nice git push',
  'timeout 5 git push',
  "dash -c 'git status'",
  "ksh -c 'git status'",
  "builtin eval 'git push'",
  "enable -f x y; git status",
  "fc -s x; git status",
  "coproc git push",
  "alias p='git push'",
  "git status\nbash -c 'git push'",
  "git status;\tbash -c 'git push'",
  "bash -c 'GIT push'",
  "git status; BASH -c 'git push'",
  'git commit -m "$(cat <<\'A\'\nx\nA\n)" -m "$(cat <<\'B\'\nB\n)"; bash -c \'echo MARKER-git\'\nA\n)"',
  'git commit -m "x `bash -c y`"',
  'git commit -m "a\\nb"',
  'git commit -m "hi!"',
  'git log --format=%h,%s @{u}..HEAD',
  'git status; bash',
  "git -c core.fsmonitor='git push origin main' status",
  "git -c core.sshCommand='git push' fetch origin",
  "git -c credential.helper='!git push origin main' fetch",
  "git -c core.pager='git push' log",
  "git -c core.editor='git push' commit",
  "git -c diff.external=x diff --ext-diff",
  "git -c filter.x.clean='git push' add .",
  "git --config-env=core.pager=E log",
  "git -ccore.fsmonitor=x status",
  "GIT_SSH_COMMAND='git push' git fetch origin",
  "git status && GIT_PAGER=x git log",
  "git -c pager.log=less log",
  "git -c",
  "caffeinate bash -c 'shopt -s extglob\ngit @(push) origin main'",
  "stdbuf -o0 bash -c 'shopt -s extglob\ngit @(push) origin main'",
  "flock /tmp/x sh -c 'git status'",
  "setsid zsh -c 'git status'",
  "git status; caffeinate eval 'git status'",
  "unbuffer busybox sh -c x; git status",
  "/usr/bin/caffeinate /bin/bash -c 'git status'",
  "git add scripts/sh",
  "caffeinate bash run.sh; git status",
  "env GIT_SSH_COMMAND=x git fetch",
  "git --config-env core.pager git log",
  "git status; zsh",
  "git status; dash",
  "git status; ksh",
  "git status; fish",
  "git status; csh",
  "git status; tcsh",
  "git status; mksh",
  "git status; yash",
  "git status; busybox",
  "git status;\texec x",
  "git status; exec x",
  "git status\nexec x",
  "builtin git push",
  'git commit -m "$(cat <<\'EOF\'\nmsg\n',
  'git commit -m "$(cat <<\'1\'\nx\n1\n)"',
  ">o exec git status",
  ">&2 exec git status",
  ">|o exec git status",
  "2>o exec git status",
  "12>o exec git status",
  "git status &>o exec x",
  "if exec git status; then true; fi",
  "if true; then exec git status; fi",
  "if true; then true; else exec git status; fi",
  "if true; then true; elif exec git status; then true; fi",
  "while exec git status; do true; done",
  "until exec git status; do true; done",
  "while true; do exec git status; done",
  "FOO=1 exec git status",
  "A=1 exec git status",
  '"$(cat <<\'EOF\'\nx\nEOF\n)" git status',
  "git -c core.fsmonitor=false status",
  'git commit -m "$(cat <<\'EOF\'\nfeat(x): don\'t break (really)\n\nbody with $VAR and `ticks`\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nxEOF\nEOF\n)"',
  'git commit -m "$(cat <<\'EOF\'\nuse $VAR\nEOF\n)" -m \'plain\'',
  'git commit -m "$(cat <<\'EOF\'\nx)"; git branch -D victim; echo "\nEOF\n)"',
  "'a\"b' x; git status",
  "git status; 'a\"b' x",
];

const PLAIN_COMMANDS = [
  'git status',
  'git status --short && git log --oneline -5',
  'git -C ../wt status',
  'git add -A && git commit -m "feat(guards): x — y"',
  "git commit -m 'feat(guards): it works'",
  'git log --oneline -5 | head -3',
  'git diff --no-ext-diff HEAD~1 > /tmp/d.txt 2>&1',
  'git add .',
  'git add src/env',
  'git add bash.md',
  'git -C . status',
  'git diff --no-ext-diff -- .',
  'git log --author time',
  'git worktree add ../x -b feat/y',
  'git branch -d feat/x',
  'git rev-parse HEAD^',
  'git log HEAD~3..HEAD',
  'git show --no-ext-diff HEAD:README.md',
  'ls -la && node --test x.js',
  'npm --prefix engine test 2>&1 | tail -5',
  "git log --format='%h %s'",
  'git status 2>&1 | tail -3',
  'git diff --no-ext-diff > out.txt 2>&1',
  'if git status; then echo ok; fi',
  'git log --format=%h,%s HEAD~2..HEAD',
  'git log -n +3',
  'git config user.name',
  'git\tstatus',
  "git -c user.email=p@p -c user.name=p commit -m x",
  "git -c commit.gpgsign=false commit -m x",
  "git -c color.ui=never log",
  "git -c core.quotepath=false status",
  "git -c pager.log=false log",
  "git -c advice.detachedHead=false checkout x",
  "ls -c",
  "ps -c",
  "git status\ngit log",
  'git -c "pager.log=false" log',
  "git -c 'pager.log=false' log",
  "./a=b exec git status",
  "1=x exec git status",
  "2a>o exec git status",
  "a2>o exec git status",
  "ls>o exec git status",
  "1 exec git status",
  "MYGIT_A=1 git status",
  "git log --grep=a-cx",
  "git -c tag.gpgsign=false tag x",
  "git -c init.defaultBranch=main init",
  "git -c format.pretty=oneline log",
  "git -c diff.noprefix=true diff",
  "git -c User.Name status",
  "git commit -m \"fix: don't stop\"",
  "git commit -m \"fix: don't stop\" -m \"body: it's fine\"",
  'git commit -F /tmp/commit-msg.txt',
  "echo 'a\"b'; git status",
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

describe('COMPLEX_NEAR_GIT_REASON', () => {
  it('Given the exported reason, when read, then it names craft and git', () => {
    const sut = REASON;

    assert.match(sut, /^craft: .*git/);
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
