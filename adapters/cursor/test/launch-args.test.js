import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchArgs } from '../src/launch-args.js';

const DIR = '/tmp/throwaway-proj';
const MODEL = 'claude-sonnet-5-high';

describe('buildLaunchArgs — the non-interactive cursor-agent -p posture', () => {
  it('Given a working dir and model, when built, then it emits -p --output-format json --model <id> --workspace <dir> --force', () => {
    const sut = buildLaunchArgs({ workingDir: DIR, model: MODEL });

    assert.deepEqual(sut, ['-p', '--output-format', 'json', '--model', MODEL, '--workspace', DIR, '--force']);
  });

  it('Given the argv, when inspected, then the model and workspace are discrete flag+value pairs (never interpolated)', () => {
    const sut = buildLaunchArgs({ workingDir: DIR, model: MODEL });

    assert.equal(sut[sut.indexOf('--model') + 1], MODEL);
    assert.equal(sut[sut.indexOf('--workspace') + 1], DIR);
  });

  it('Given sandbox "enabled", when built, then --sandbox enabled is appended', () => {
    const sut = buildLaunchArgs({ workingDir: DIR, model: MODEL, sandbox: 'enabled' });

    assert.equal(sut[sut.indexOf('--sandbox') + 1], 'enabled');
  });

  it('Given sandbox "disabled", when built, then --sandbox disabled is appended (both enum members accepted)', () => {
    const sut = buildLaunchArgs({ workingDir: DIR, model: MODEL, sandbox: 'disabled' });

    assert.equal(sut[sut.indexOf('--sandbox') + 1], 'disabled');
  });

  it('Given no sandbox option, when built, then --sandbox is not emitted (opt-in only)', () => {
    const sut = buildLaunchArgs({ workingDir: DIR, model: MODEL });

    assert.equal(sut.includes('--sandbox'), false);
  });

  it('Given an invalid sandbox mode, when built, then it throws (no silent forward)', () => {
    assert.throws(() => buildLaunchArgs({ workingDir: DIR, model: MODEL, sandbox: 'full-access' }), /enabled\|disabled/);
  });

  it('Given a relative working dir, when built, then it throws (unbounded workspace root refused)', () => {
    assert.throws(() => buildLaunchArgs({ workingDir: 'relative/proj', model: MODEL }), /absolute path/);
  });

  it('Given an empty working dir, when built, then it throws', () => {
    assert.throws(() => buildLaunchArgs({ workingDir: '', model: MODEL }), /absolute path/);
  });

  it('Given an empty model, when built, then it throws (never an empty --model)', () => {
    assert.throws(() => buildLaunchArgs({ workingDir: DIR, model: '' }), /non-empty string/);
  });
});
