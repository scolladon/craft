import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitDestructivePredicate } from '../../src/guards/git-destructive-predicate.js';
import { CONFIG_ALIAS_WRITE_REASON, gitInvocations, INLINE_ALIAS_REASON } from '../../src/guards/shell-git-invocations.js';

const REASON_DYNAMIC_SUBCOMMAND =
  'craft: an expansion sits where git expects an option or the subcommand — spell it out; denied fail-closed in this binding';
const REASON_PUSH = 'craft: destructive git (push) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — push', () => {
  for (const command of [
    'git push',
    'git -C . push origin main',
    'git --git-dir=.git push',
    'git -c k=v push',
    'env git push',
    '(git push)',
    "bash -c 'git push'",
    '/usr/bin/git push',
  ]) {
    it(`Given "${command}", when checked, then blocks with the push reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    });
  }
});

describe('gitDestructivePredicate() — git spelled in another case', () => {
  for (const command of ['GIT push origin main', 'Git push', '/usr/bin/GIT push', 'GIT-push origin']) {
    it(`Given "${command}", when checked, then blocks with the push reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    });
  }
});

describe('gitDestructivePredicate() - git named through zsh equals expansion', () => {
  for (const command of ['=git push origin main', 'git status && =git push', '=G\\it push', "=bash -c 'git push'", "=env -S 'git push'", '=git-push origin', "/usr/bin/env -S 'git push'"]) {
    it(`Given ${JSON.stringify(command)}, when checked, then blocks with the push reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    });
  }
});

const REASON_RESET =
  'craft: destructive git (reset --hard) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — reset', () => {
  for (const command of ['git reset --hard', 'git reset --hard HEAD', 'git reset HEAD --hard', 'git reset -q --hard']) {
    it(`Given "${command}", when checked, then blocks with the reset reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_RESET });
    });
  }

  for (const command of ['git reset --keep', 'git reset --merge', 'git reset', 'git reset -- --hard']) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

const REASON_CLEAN =
  'craft: destructive git (clean without --dry-run) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — clean', () => {
  for (const command of [
    'git clean -f',
    'git clean -fd',
    'git clean -df',
    'git clean -xdf',
    'git clean -fx',
    'git clean --force',
    'git clean -d',
    'git clean -i',
    'git -c clean.requireForce=false clean',
    'git clean -n -f $X',
    'git clean -nf "$@"',
    'git clean --dry-run -f ${A}',
  ]) {
    it(`Given "${command}", when checked, then blocks with the clean reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_CLEAN });
    });
  }

  for (const command of ['git clean -n -f', 'git clean -f -n', 'git clean -nf', 'git clean --dry-run']) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

const REASON_BRANCH =
  'craft: destructive git (forced branch delete) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — branch', () => {
  for (const command of [
    'git branch -D x',
    'git branch -df x',
    'git branch -fd x',
    'git branch --delete --force x',
    'git branch -d -f x',
    'git branch -Dr origin/x',
  ]) {
    it(`Given "${command}", when checked, then blocks with the branch reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_BRANCH });
    });
  }

  for (const command of ['git branch -d x', 'git branch --delete x', 'git branch -f x y', 'git branch', 'git branch -a']) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

const REASON_ALIAS_INLINE = INLINE_ALIAS_REASON;

describe('gitDestructivePredicate() — unparseable, unclassifiable and dynamic input', () => {
  it('Given an unterminated quote, when checked, then blocks with the parse reason', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git push\necho "x');

    assert.deepEqual(result, { block: true, reason: gitInvocations('git push\necho "x').reason });
    assert.match(result.reason, /unterminated/i);
  });

  it('Given a heredoc then git; push inside a substitution, when checked, then blocks with the parse reason', () => {
    const sut = gitDestructivePredicate;
    const command = "echo $( cat <<'E'\nhi\nE\ngit; push origin )";

    const result = sut(command);

    assert.deepEqual(result, { block: true, reason: gitInvocations(command).reason });
    assert.match(result.reason, /here-document/);
  });

  it('Given a heredoc then git; push inside a function substitution, when checked, then blocks with the parse reason', () => {
    const sut = gitDestructivePredicate;
    const command = "echo ${ cat <<'E'\nhi\nE\ngit; push origin; }";

    const result = sut(command);

    assert.deepEqual(result, { block: true, reason: gitInvocations(command).reason });
    assert.match(result.reason, /here-document/);
  });

  it('Given a comment holding << inside a function substitution, when checked, then the push on the next line blocks', () => {
    const sut = gitDestructivePredicate;
    const command = 'echo ${ : # <<E\ngit push\nE\n}';

    const result = sut(command);

    assert.equal(result.block, true);
    assert.match(result.reason, /destructive git \(push\)/);
  });

  for (const command of ['git --frobnicate push', 'git -C. push', '$G push']) {
    it(`Given "${command}", when checked, then blocks with the push reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    });
  }

  for (const command of ['git -c alias.p=push p', 'git --config-env alias.x=HOME x']) {
    it(`Given "${command}", when checked, then blocks with the inline alias reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_ALIAS_INLINE });
    });
  }

  it('Given a reset with a dynamic argument, when checked, then blocks with the reset reason', () => {
    const sut = gitDestructivePredicate;

    const result = sut('H=--hard; git reset $H');

    assert.deepEqual(result, { block: true, reason: REASON_RESET });
  });

  it('Given a branch with a dynamic argument, when checked, then blocks with the branch reason', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git branch "$F" x');

    assert.deepEqual(result, { block: true, reason: REASON_BRANCH });
  });
});

describe('gitDestructivePredicate() — routine git passes', () => {
  for (const command of [
    'git --version',
    'git --no-optional-locks -C /w -c core.fsmonitor=false remote -v',
    'git --no-optional-locks -c core.fsmonitor=false rev-parse origin/HEAD',
    'git status',
    'git add -A',
    "git commit -m 'x'",
    'git commit -m "$(cat <<\'EOF\'\nfeat: x\nEOF\n)"',
    'git commit -m "$(cat <<\'EOF\'\nfix: a; b\nEOF\n)"',
    'git log --oneline -3',
    'git diff --no-ext-diff',
    'git worktree add ../w -b b',
    'git worktree list',
    'git worktree remove ../w',
    'git rev-parse HEAD',
    'git branch -d merged',
  ]) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

describe('gitDestructivePredicate() — known over-blocking', () => {
  for (const command of ['echo git push', '$HOME/bin/deploy push']) {
    it(`Given "${command}", when checked, then blocks (accepted false positive)`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitDestructivePredicate() — a subcommand carried by an expansion', () => {
  for (const command of ['P=push; git $P', 'git $(echo push)', 'git -C . "$VERB"', 'git $A $B', 'git $OPTS push', 'P=push; git $P HEAD', 'git $(echo push) origin']) {
    it(`Given "${command}", when checked, then blocks with the dynamic subcommand reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_DYNAMIC_SUBCOMMAND });
    });
  }

  it('Given a dynamic option followed by a literal safe subcommand, when checked, then it blocks', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git $OPTS status');

    assert.deepEqual(result, { block: true, reason: REASON_DYNAMIC_SUBCOMMAND });
  });
});

const assertBlocks = rows => {
  for (const command of rows) {
    it(`Given ${JSON.stringify(command)}, when checked, then blocks`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
};

const assertPasses = rows => {
  for (const command of rows) {
    it(`Given ${JSON.stringify(command)}, when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
};

describe('gitDestructivePredicate() — ANSI-C and locale quoting', () => {
  assertBlocks([
    "$'\\x67it' push origin main",
    "$'\\147it' push",
    "git $'pu\\163h'",
    "bash -c $'echo x\\ngit push'",
    "eval $'git\\x20push'",
    '$"git" push',
    "$'git' push",
  ]);
});

describe('gitDestructivePredicate() — unmodelled constructs that stay passes', () => {
  assertPasses([
    'git status',
    'git -C "$WT" status',
    'git -C "$WT" branch --show-current',
    'git log --oneline',
    'git diff --no-ext-diff',
    'FOO=1 git status',
    'git add src/*.js',
    'git log --grep \'*\'',
    'git commit -m "fix {a,b}"',
    "echo $'hello'",
    'ls *.md',
    'env FOO=1 node x.js',
    "bash -c 'echo hi'",
    "bash -lc 'git status'",
    'git commit -m "$(cat <<\'EOF\'\nfeat: x\nEOF\n)"',
  ]);
});

describe('gitDestructivePredicate() — brace and glob words', () => {
  assertBlocks([
    '{git,push} origin',
    'git {push,x}',
    '{git,-C,.,reset,--hard}',
    'x/gi[t] push',
    'x/g?t push',
    'git pus[h] origin',
    'git {a..b} push',
    'git {push,"\\""}',
  ]);

  assertPasses(['git rev-parse HEAD@{upstream}', '[ -f x ] && git status', '[[ -n "$A" ]] && git status', 'ls {a}']);
});

describe('gitDestructivePredicate() — parameter expansion and arithmetic', () => {
  assertBlocks([
    'echo ${#x}; git push\necho }',
    'echo ${x%%#*}; git push\necho }',
    '(( x = 1 << 2 ))\ngit push',
    '(( x = 1 << 2 ))\ngit push\n2',
    'echo $(( 1 << 2 )); git push',
  ]);

  assertPasses(['echo ${#x}; git status', '( cat <<EOF\nx\nEOF\n)\ngit status', 'echo $(( 1 << 2 ))']);
});

describe('gitDestructivePredicate() — substitutions inside arithmetic expansion', () => {
  assertBlocks([
    'echo $(($(git push -f origin)))',
    'echo $((`git push -f origin`))',
    'echo $((${ git push -f origin; }))',
    'echo $((${| git push -f origin; }))',
    'echo $(( $(( $(git push -f origin) )) ))',
    "echo $(( ')' $(git push -f origin) ))",
    'echo $((git push -f origin) )',
  ]);

  assertPasses(['echo $(( $(printf 3) + 1 ))', 'echo $(( 16#ff ))', 'echo $(( 1 <<E ))']);
});

describe('gitDestructivePredicate() — shell and env option grammar', () => {
  assertBlocks([
    "bash -o pipefail -c 'git push'",
    "bash -O extglob -c 'git push'",
    "bash +e -c 'git push'",
    "env -S'git push'",
    "env -u X -S 'git push'",
    "env -C /x -S 'git push'",
    "env -iS 'git push'",
    "env --split-string='git push'",
    "env -P /bin -S 'git push'",
    "sh -c 'git push'",
  ]);

  assertPasses(["env -u X node x.js", "env -S 'node x.js'", "bash -o pipefail script.sh", "bash -c 'echo push'"]);
});

describe('gitDestructivePredicate() — wrappers and dashed builtins', () => {
  assertBlocks([
    'G=git; command $G push',
    'G=git; exec $G push',
    'G=git; nohup $G push',
    'G=git; nohup $G reset --hard',
    'git-push origin main',
    '/x/libexec/git-core/git-reset --hard',
    '"$(git --exec-path)"/git-push origin main',
    'env git-push',
  ]);

  assertPasses([
    'git-lfs ls-files',
    'G=git; command $G status',
    'rm git-push.txt',
    'git-status',
    'echo "$WT" log',
  ]);
});

const REASON_CONFIG_CHANNEL = 'craft: git config injected outside -c is denied in this binding';

describe('gitDestructivePredicate() — config channels outside -c', () => {
  for (const command of [
    `GIT_CONFIG_PARAMETERS="'alias.y=push'" git y`,
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0=push git x',
    `env GIT_CONFIG_PARAMETERS="'alias.y=push'" git x`,
    'GIT_CONFIG_GLOBAL=/x git status',
    'GIT_CONFIG_SYSTEM=/x git status',
    'git -c include.path=f w',
    'git -c includeIf.onbranch:x.path=f status',
    'git --config-env include.path=E st',
    "shopt -s expand_aliases\nalias p='git push'\np origin",
    "alias g=git",
  ]) {
    it(`Given ${JSON.stringify(command)}, when checked, then blocks with the config channel reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_CONFIG_CHANNEL });
    });
  }

  assertPasses(["alias ll='ls -l'", 'GIT_CONFIG_NOSYSTEM=1 git status', 'GIT_CONFIG_GLOBAL=/x ls', 'git -c core.pager=cat status']);
});

describe('gitDestructivePredicate() — long-option abbreviations follow git parse-options', () => {
  for (const command of ['git reset --har HEAD~1', 'git reset --ha HEAD~1', 'git reset --h HEAD~1']) {
    it(`Given "${command}", when checked, then blocks with the reset reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_RESET });
    });
  }

  for (const command of ['git branch -d --forc z', 'git branch --del --force z', 'git branch --de --f z']) {
    it(`Given "${command}", when checked, then blocks with the branch reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_BRANCH });
    });
  }

  for (const command of ['git clean -f --dry', 'git clean -f --dry-', 'git clean -f --dry-r', 'git clean -f --dry-ru']) {
    it(`Given "${command}", when checked, then counts the abbreviation as a dry run`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }

  for (const command of ['git clean -f --d', 'git clean -f --dr']) {
    it(`Given "${command}", when checked, then does not count the ambiguous abbreviation as a dry run`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_CLEAN });
    });
  }
});

describe('gitDestructivePredicate() — clean dry-run follows git option order', () => {
  for (const command of [
    'git clean -fen',
    'git clean -f -e -n',
    'git clean -fx --exclude -n',
    'git clean -f --exclude=-n',
    'git clean -f --exclude=a-n',
    'git clean -n --no-dry-run -f',
    'git clean -nf --no-dry',
    'git clean -fd -- -n .',
    'git clean -n --no-d',
  ]) {
    it(`Given "${command}", when checked, then blocks with the clean reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_CLEAN });
    });
  }

  assertPasses([
    'git clean -n',
    'git clean -nd',
    'git clean --dry-run -fd',
    'git clean -fdn',
    'git clean -f -n',
    'git clean --no-dry-run -n -f',
    'git clean -f -e x -n',
    'git clean -fexn -n',
  ]);
});

describe('gitDestructivePredicate() — refused global option before a destructive verb', () => {
  const rows = [
    ['git --frobnicate reset --hard', REASON_RESET],
    ['git --frobnicate clean -fd', REASON_CLEAN],
    ['git --frobnicate branch -D x', REASON_BRANCH],
  ];
  for (const [command, reason] of rows) {
    it(`Given "${command}", when checked, then blocks with the verb reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason });
    });
  }

  it('Given "git --frobnicate status", when checked, then does not block', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git --frobnicate status');

    assert.deepEqual(result, { block: false });
  });
});

describe('gitDestructivePredicate() — option and wrapper rows that guard the parsers', () => {
  assertBlocks([
    'git clean -f dir-n',
    'git clean -fd build-n',
    "env --chdir /x -S 'git push'",
    "env --unset X -S 'git push'",
    "bash +c 'git push'",
    "bash +ec 'git push'",
    '(( ((1)) << 2 ))\ngit push\n2',
  ]);

  assertPasses([
    '[[ $b == main ]] && git status',
    'git reset HEAD@{1}',
    'git branch -d x@{u}',
    'git log --grep GIT_CONFIG_COUNT=1',
    'GIT_CONFIG_COUNTER=1 git status',
    '(( x = 1 )); cat <<EOF\nhi\nEOF',
    'git branch -d --no-force x',
    'git branch -d x --sort=-refname',
  ]);

  for (const command of ['GIT_CONFIG_KEY_0=alias.x git x', 'GIT_CONFIG_VALUE_0=push git x']) {
    it(`Given ${JSON.stringify(command)}, when checked, then blocks with the config channel reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_CONFIG_CHANNEL });
    });
  }

  it('Given a variable that only ends in GIT_CONFIG_COUNT, when checked, then it passes', () => {
    const sut = gitDestructivePredicate;

    const result = sut('MY_GIT_CONFIG_COUNT=1 git status');

    assert.deepEqual(result, { block: false });
  });
});

describe('gitDestructivePredicate() — clean option parsing pins', () => {
  assertPasses([
    'git clean --dry-run --n',
    'git clean --dry-run --no',
    'git clean --dry-run --exclude x',
    'git clean x -n',
    'git clean -ne --no-dry-run',
    'git branch -D5 x',
  ]);
});

const ALIAS_REASON = CONFIG_ALIAS_WRITE_REASON;

describe('gitDestructivePredicate() — git config naming an alias key', () => {
  for (const command of ['git config alias.p push; git p', 'git config alias.x diff']) {
    it(`Given "${command}", when checked, then blocks with the alias reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: ALIAS_REASON });
    });
  }
});

describe('gitDestructivePredicate() — dollar-bracket arithmetic', () => {
  assertBlocks(["echo $[ '$(git push -f origin)' ]", 'echo $[1<<2]\ngit push origin main']);

  assertPasses(['echo $[ 1 + 2 ]', 'echo $[1<<2]']);
});
