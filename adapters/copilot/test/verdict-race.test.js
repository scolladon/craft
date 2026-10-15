import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { awaitVerdict } from '../src/verdict-race.js';

const DEADLINE_MS = 1234;

function arrange() {
  const worker = Object.assign(new EventEmitter(), {
    terminated: 0,
    terminate() {
      this.terminated += 1;
    },
  });
  const calls = [];
  const timer = { fire: null, cleared: 0, ms: null };
  const handlers = {
    onVerdict: outcome => calls.push(['verdict', outcome]),
    onTimeout: () => calls.push(['timeout']),
    onCrash: err => calls.push(['crash', err]),
    onExit: () => calls.push(['exit']),
  };
  const startTimer = (fire, ms) => {
    timer.fire = fire;
    timer.ms = ms;
    return timer;
  };
  const clearTimer = () => {
    timer.cleared += 1;
  };
  awaitVerdict(worker, { deadlineMs: DEADLINE_MS, startTimer, clearTimer, ...handlers });
  return { worker, calls, timer };
}

describe('awaitVerdict', () => {
  it('Given a started race, When arming, Then the timer uses the deadline', () => {
    const sut = arrange();

    assert.equal(sut.timer.ms, DEADLINE_MS);
  });

  it('Given the timer fired, When a late message arrives, Then only the timeout concludes and the worker is terminated', () => {
    const sut = arrange();

    sut.timer.fire();
    sut.worker.emit('message', { verdict: { block: false } });

    assert.deepEqual(sut.calls, [['timeout']]);
    assert.equal(sut.worker.terminated, 1);
  });

  it('Given a message arrived first, When the timer fires later, Then nothing else runs', () => {
    const sut = arrange();
    const outcome = { verdict: { block: false } };

    sut.worker.emit('message', outcome);
    sut.timer.fire();

    assert.deepEqual(sut.calls, [['verdict', outcome]]);
    assert.equal(sut.worker.terminated, 0);
    assert.equal(sut.timer.cleared, 1);
  });

  it('Given a settled race, When an error then an exit arrive, Then neither runs', () => {
    const sut = arrange();

    sut.worker.emit('message', { verdict: { block: true } });
    sut.worker.emit('error', new Error('late'));
    sut.worker.emit('exit', 0);

    assert.equal(sut.calls.length, 1);
  });

  it('Given an error first, When the exit follows, Then only the crash concludes', () => {
    const sut = arrange();
    const err = new Error('boom');

    sut.worker.emit('error', err);
    sut.worker.emit('exit', 1);

    assert.deepEqual(sut.calls, [['crash', err]]);
  });

  it('Given an exit with no verdict, When it arrives, Then the exit concludes once', () => {
    const sut = arrange();

    sut.worker.emit('exit', 0);

    assert.deepEqual(sut.calls, [['exit']]);
  });
});
