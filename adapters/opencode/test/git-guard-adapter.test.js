import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { commandFromToolEvent, decideGuard } from '../src/git-guard-adapter.js';

// Live-pinned opencode 1.18.3 shapes:
//   input  = { tool: 'bash', sessionID, callID }
//   output = { args: { command: '<the bash command>' } }
const LIVE_INPUT = { tool: 'bash', sessionID: 'ses_x', callID: 'bash_y' };

describe('commandFromToolEvent() — extracts the command from output.args.command', () => {
  it('Given the live opencode (input, output) shapes, when extracted, then returns output.args.command', () => {
    const sut = commandFromToolEvent;

    const result = sut(LIVE_INPUT, { args: { command: 'git diff' } });

    assert.equal(result, 'git diff');
  });

  it('Given only input carries args.command (defensive fallback), when extracted, then returns it', () => {
    const sut = commandFromToolEvent;

    const result = sut({ tool: 'bash', args: { command: 'git show' } }, {});

    assert.equal(result, 'git show');
  });

  it('Given output takes precedence over the input fallback, when extracted, then returns output.args.command', () => {
    const sut = commandFromToolEvent;

    const result = sut({ args: { command: 'input-cmd' } }, { args: { command: 'output-cmd' } });

    assert.equal(result, 'output-cmd');
  });

  it('Given neither carries a command, when extracted, then returns an empty string', () => {
    const sut = commandFromToolEvent;

    const result = sut(LIVE_INPUT, {});

    assert.equal(result, '');
  });

  it('Given undefined input and output, when extracted, then returns an empty string', () => {
    const sut = commandFromToolEvent;

    const result = sut(undefined, undefined);

    assert.equal(result, '');
  });
});

describe('decideGuard() — composition of extraction + predicate', () => {
  it('Given a bash event carrying a bare git diff, when guarded, then returns block:true with a reason', () => {
    const sut = decideGuard;

    const result = sut(LIVE_INPUT, { args: { command: 'git diff' } });

    assert.equal(result.block, true);
    assert.equal(typeof result.reason, 'string');
  });

  it('Given a bash event carrying git diff --no-ext-diff, when guarded, then returns block:false', () => {
    const sut = decideGuard;

    const result = sut(LIVE_INPUT, { args: { command: 'git diff --no-ext-diff' } });

    assert.equal(result.block, false);
  });

  it('Given a bash event with no command, when guarded, then returns block:false', () => {
    const sut = decideGuard;

    const result = sut(LIVE_INPUT, {});

    assert.equal(result.block, false);
  });

  it('Given an injected spy guard, when guarded, then the spy receives the extracted command', () => {
    let received;
    const spyGuard = (command) => {
      received = command;
      return { block: false };
    };
    const sut = decideGuard;

    sut(LIVE_INPUT, { args: { command: 'git diff' } }, spyGuard);

    assert.equal(received, 'git diff');
  });
});
