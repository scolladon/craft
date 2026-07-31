import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchArgs } from '../src/launch-args.js';

const MODEL = 'anthropic/claude-sonnet-4-6';
const READ_FILE = '/abs/CONVENTIONS.md';
const EDIT_FILE = '/abs/life.py';
const MESSAGE = 'go';

describe('buildLaunchArgs — the non-interactive aider posture', () => {
  it('Given a model, one readFile and a message, when built, then it emits the full posture argv in order', () => {
    const sut = buildLaunchArgs({ model: MODEL, readFiles: [READ_FILE], message: MESSAGE });

    assert.deepEqual(sut, [
      '--yes-always',
      '--no-gitignore',
      '--no-check-update',
      '--no-show-release-notes',
      '--no-analytics',
      '--model',
      MODEL,
      '--read',
      READ_FILE,
      '--message',
      MESSAGE,
    ]);
  });

  it('Given the argv, when inspected, then there is no --workspace/--working-dir/--cwd token', () => {
    const sut = buildLaunchArgs({ model: MODEL, readFiles: [READ_FILE], message: MESSAGE });

    assert.equal(sut.includes('--workspace'), false);
    assert.equal(sut.includes('--working-dir'), false);
    assert.equal(sut.includes('--cwd'), false);
  });

  it('Given the argv, when inspected, then --model and --read values are discrete flag+value pairs (never interpolated)', () => {
    const sut = buildLaunchArgs({ model: MODEL, readFiles: [READ_FILE], message: MESSAGE });

    assert.equal(sut[sut.indexOf('--model') + 1], MODEL);
    assert.equal(sut[sut.indexOf('--read') + 1], READ_FILE);
  });

  it('Given two readFiles, when built, then two discrete --read pairs are emitted and message stays last', () => {
    const sut = buildLaunchArgs({
      model: MODEL,
      readFiles: ['/abs/one.md', '/abs/two.md'],
      message: MESSAGE,
    });

    assert.deepEqual(sut, [
      '--yes-always',
      '--no-gitignore',
      '--no-check-update',
      '--no-show-release-notes',
      '--no-analytics',
      '--model',
      MODEL,
      '--read',
      '/abs/one.md',
      '--read',
      '/abs/two.md',
      '--message',
      MESSAGE,
    ]);
  });

  it('Given empty readFiles, when built, then no --read token is emitted and --message stays last', () => {
    const sut = buildLaunchArgs({ model: MODEL, readFiles: [], message: MESSAGE });

    assert.equal(sut.includes('--read'), false);
    assert.equal(sut[sut.length - 1], MESSAGE);
    assert.equal(sut[sut.length - 2], '--message');
  });

  it('Given a readFile and an editFile, when built, then --file pairs land after --read and before --message', () => {
    const sut = buildLaunchArgs({
      model: MODEL,
      readFiles: [READ_FILE],
      editFiles: [EDIT_FILE],
      message: MESSAGE,
    });

    assert.deepEqual(sut, [
      '--yes-always',
      '--no-gitignore',
      '--no-check-update',
      '--no-show-release-notes',
      '--no-analytics',
      '--model',
      MODEL,
      '--read',
      READ_FILE,
      '--file',
      EDIT_FILE,
      '--message',
      MESSAGE,
    ]);
  });

  it('Given two editFiles, when built, then two discrete --file pairs are emitted and message stays last', () => {
    const sut = buildLaunchArgs({
      model: MODEL,
      editFiles: ['/abs/one.py', '/abs/two.py'],
      message: MESSAGE,
    });

    assert.equal(sut[sut.indexOf('--file') + 1], '/abs/one.py');
    assert.equal(sut[sut.lastIndexOf('--file') + 1], '/abs/two.py');
    assert.equal(sut[sut.length - 1], MESSAGE);
    assert.equal(sut[sut.length - 2], '--message');
  });

  it('Given empty editFiles, when built, then no --file token is emitted and --message stays last', () => {
    const sut = buildLaunchArgs({ model: MODEL, editFiles: [], message: MESSAGE });

    assert.equal(sut.includes('--file'), false);
    assert.equal(sut[sut.length - 1], MESSAGE);
    assert.equal(sut[sut.length - 2], '--message');
  });

  it('Given an empty model, when built, then it throws (non-empty string required)', () => {
    assert.throws(
      () => buildLaunchArgs({ model: '', readFiles: [], message: MESSAGE }),
      /non-empty string/,
    );
  });

  it('Given a non-string model, when built, then it throws (non-empty string required)', () => {
    assert.throws(
      () => buildLaunchArgs({ model: 42, readFiles: [], message: MESSAGE }),
      /non-empty string/,
    );
  });

  it('Given an empty message, when built, then it throws', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, readFiles: [], message: '' }),
      /non-empty string/,
    );
  });

  it('Given a non-string message, when built, then it throws', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, readFiles: [], message: 7 }),
      /non-empty string/,
    );
  });

  it('Given a readFiles entry that is an empty string, when built, then it throws naming each readFiles entry', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, readFiles: [''], message: MESSAGE }),
      /each readFiles entry/,
    );
  });

  it('Given a readFiles entry that is not a string, when built, then it throws naming each readFiles entry', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, readFiles: [123], message: MESSAGE }),
      /each readFiles entry/,
    );
  });

  it('Given an editFiles entry that is an empty string, when built, then it throws naming each editFiles entry', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, editFiles: [''], message: MESSAGE }),
      /each editFiles entry/,
    );
  });

  it('Given an editFiles entry that is not a string, when built, then it throws naming each editFiles entry', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, editFiles: [123], message: MESSAGE }),
      /each editFiles entry/,
    );
  });

  it('Given an editFiles entry beginning with a hyphen, when built, then it throws', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, editFiles: ['--yes-always'], message: MESSAGE }),
      /each editFiles entry/,
    );
  });

  it('Given a readFiles entry beginning with a hyphen, when built, then it throws', () => {
    assert.throws(
      () => buildLaunchArgs({ model: MODEL, readFiles: ['-c'], message: MESSAGE }),
      /each readFiles entry/,
    );
  });
});
