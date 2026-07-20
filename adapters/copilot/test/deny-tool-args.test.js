import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DENY_TOOL_PATTERNS, buildLaunchArgs } from '../src/deny-tool-args.js';

// Well-formedness only — never used as a substitute for the membership pin
// below. The catch-all `[a-z0-9_-]+\([^()]+\)` alternative was deliberately
// dropped: it also accepts typos like `shel(git push)` and unrelated
// commands like `shell(rm -rf /)`, so it asserts almost nothing.
const PINNED_GRAMMAR = /^(shell\([^()]+\)|write|url\([^()]+\))$/;
const WORKING_DIR = '/tmp/craft-worktree';

// The live-pinned realistic variants (flag order, long-form aliases) an
// agent actually emits per destructive verb. Kept as a positive membership
// pin — not a grammar check — so a removed or weakened pattern fails loudly
// instead of the suite going tautologically green.
const EXPECTED_PATTERNS = [
  'shell(git push)',
  'shell(git reset --hard)',
  'shell(git clean -fd)',
  'shell(git clean -df)',
  'shell(git clean -f -d)',
  'shell(git clean -d -f)',
  'shell(git clean --force)',
  'shell(git branch -D)',
  'shell(git branch --delete --force)',
  'shell(git branch -d --force)',
];

describe('DENY_TOOL_PATTERNS — positive membership pin', () => {
  for (const pattern of EXPECTED_PATTERNS) {
    it(`Given the committed deny set, when checked for "${pattern}", then it is present`, () => {
      const sut = DENY_TOOL_PATTERNS;

      assert.ok(sut.includes(pattern), `missing expected pattern "${pattern}"`);
    });
  }

  it('Given the committed deny set, when its length is compared to the expected list, then they match exactly (no undocumented additions or removals)', () => {
    const sut = DENY_TOOL_PATTERNS;

    assert.equal(sut.length, EXPECTED_PATTERNS.length);
  });

  it('Given every committed deny pattern, when each is matched against the pinned grammar, then all are well-formed', () => {
    const sut = DENY_TOOL_PATTERNS;

    for (const pattern of sut) {
      assert.match(pattern, PINNED_GRAMMAR, `pattern "${pattern}" is not well-formed`);
    }
  });

  it('Given a caller attempts to mutate DENY_TOOL_PATTERNS, when the mutation is applied, then the value is unchanged', () => {
    const sut = DENY_TOOL_PATTERNS;
    const before = [...sut];

    assert.throws(() => {
      sut.push('shell(rm -rf /)');
    }, TypeError);
    assert.deepEqual(sut, before);
    assert.ok(Object.isFrozen(sut));
  });
});

describe('buildLaunchArgs() — never-emit pin', () => {
  it('Given a working dir, when buildLaunchArgs runs, then --allow-all-paths appears nowhere in the joined argv', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.ok(!result.join(' ').includes('--allow-all-paths'));
  });

  it('Given a working dir, when buildLaunchArgs runs, then --allow-all-paths appears in no individual argv element', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.ok(!result.some((a) => a.includes('--allow-all-paths')));
  });
});

describe('buildLaunchArgs() — containment flags', () => {
  it('Given a working dir, when buildLaunchArgs runs, then --add-dir is emitted as a flag element immediately followed by the working dir element', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.equal(result[result.indexOf('--add-dir') + 1], WORKING_DIR);
  });

  it('Given a working dir, when buildLaunchArgs runs, then every committed deny pattern is emitted as its own --deny-tool=<pattern> element', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    for (const pattern of DENY_TOOL_PATTERNS) {
      assert.ok(result.includes(`--deny-tool=${pattern}`), `missing --deny-tool=${pattern}`);
    }
  });

  it('Given the emitted argv, when --allow-all-tools is checked, then it is present even though deny rules take precedence over it', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.ok(result.includes('--allow-all-tools'));
  });
});

describe('buildLaunchArgs() — containment root validation', () => {
  it('Given a missing working dir, when buildLaunchArgs runs, then it throws naming the missing containment root', () => {
    const sut = buildLaunchArgs;

    assert.throws(() => sut({}), /containment root/);
  });

  it('Given an empty working dir, when buildLaunchArgs runs, then it throws naming the missing containment root', () => {
    const sut = buildLaunchArgs;

    assert.throws(() => sut({ workingDir: '' }), /containment root/);
  });

  it('Given a relative working dir, when buildLaunchArgs runs, then it throws naming the missing containment root', () => {
    const sut = buildLaunchArgs;

    assert.throws(() => sut({ workingDir: 'relative/path' }), /containment root/);
  });
});
