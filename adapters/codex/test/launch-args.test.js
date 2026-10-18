import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchArgs } from '../src/launch-args.js';

const WORKING_DIR = '/Users/example/repo';

describe('buildLaunchArgs() — forbidden flags', () => {
  it('Given a working dir, when buildLaunchArgs runs, then the full-access sandbox mode appears nowhere in the emitted argv', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.ok(!result.join(' ').includes('danger-full-access'));
    for (const element of result) {
      assert.ok(!element.includes('danger-full-access'));
    }
  });

  it('Given a working dir, when buildLaunchArgs runs, then --ephemeral appears nowhere in the emitted argv', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.ok(!result.join(' ').includes('--ephemeral'));
    for (const element of result) {
      assert.ok(!element.includes('--ephemeral'));
    }
  });
});

describe('buildLaunchArgs() — sandbox posture', () => {
  it('Given a working dir, when buildLaunchArgs runs, then -s is emitted immediately followed by workspace-write', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.equal(result[result.indexOf('-s') + 1], 'workspace-write');
  });
});

describe('buildLaunchArgs() — working dir posture', () => {
  it('Given a working dir, when buildLaunchArgs runs, then -C is emitted as its own element immediately followed by the working dir element', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.equal(result[result.indexOf('-C') + 1], WORKING_DIR);
  });
});

describe('buildLaunchArgs() — hook-trust posture', () => {
  it('Given no bypass request, when buildLaunchArgs runs, then --dangerously-bypass-hook-trust is absent', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.ok(!result.includes('--dangerously-bypass-hook-trust'));
  });

  it('Given bypassHookTrust false, when buildLaunchArgs runs, then --dangerously-bypass-hook-trust is absent', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR, bypassHookTrust: false });

    assert.ok(!result.includes('--dangerously-bypass-hook-trust'));
  });

  it('Given an explicit bypass request, when buildLaunchArgs runs, then --dangerously-bypass-hook-trust is present', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR, bypassHookTrust: true });

    assert.ok(result.includes('--dangerously-bypass-hook-trust'));
  });
});

describe('buildLaunchArgs() — failure contract', () => {
  const invalidWorkingDirs = [undefined, '', './x'];

  for (const workingDir of invalidWorkingDirs) {
    it(`Given working dir ${JSON.stringify(workingDir)}, when buildLaunchArgs runs, then it throws naming the missing containment root`, () => {
      const sut = buildLaunchArgs;

      assert.throws(() => sut({ workingDir }), /must be a non-empty absolute path/);
    });
  }
});

const FLAG_CONFIG_OVERRIDE = '-c';
const TTY_SESSIONS_OFF = 'features.unified_exec_tty=false';

describe('buildLaunchArgs() - tty-session posture', () => {
  it('Given a working dir, when buildLaunchArgs runs, then -c is emitted as its own element immediately followed by features.unified_exec_tty=false', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    const flagIndex = result.indexOf(FLAG_CONFIG_OVERRIDE);
    assert.notEqual(flagIndex, -1, 'the config override flag must be emitted');
    assert.equal(result[flagIndex + 1], TTY_SESSIONS_OFF);
  });

  it('Given bypassHookTrust true, when buildLaunchArgs runs, then -c is still immediately followed by features.unified_exec_tty=false', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR, bypassHookTrust: true });

    const flagIndex = result.indexOf(FLAG_CONFIG_OVERRIDE);
    assert.notEqual(flagIndex, -1, 'the config override flag must be emitted');
    assert.equal(result[flagIndex + 1], TTY_SESSIONS_OFF);
  });

  it('Given a working dir, when buildLaunchArgs runs, then features.unified_exec_tty=false appears exactly once', () => {
    const sut = buildLaunchArgs;

    const result = sut({ workingDir: WORKING_DIR });

    assert.equal(result.filter((element) => element === TTY_SESSIONS_OFF).length, 1);
  });
});
