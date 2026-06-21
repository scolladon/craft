import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { workspace, decisions, propose, integrate } from '../src/roleless.js';

describe('workspace()', () => {
  it('Given a present git repo, when workspace runs, then ok is true and the record notes the current checkout', async () => {
    const gitProbe = { isGitRepo: () => true };

    const sut = workspace;
    const result = await sut({ gitProbe });

    assert.equal(result.ok, true);
    assert.match(result.record, /current checkout/);
  });

  it('Given no git repo, when workspace runs, then it returns a workspace blocker with no git repository reason', async () => {
    const gitProbe = { isGitRepo: () => false };

    const sut = workspace;
    const result = await sut({ gitProbe });

    assert.equal(result.ok, false);
    assert.equal(result.blocker.unit, 'workspace');
    assert.match(result.blocker.reason, /no git repository/);
    assert.equal(result.record, '');
  });
});

describe('decisions()', () => {
  it('Given the decisions step, when it runs, then it returns a recorded no-op and invokes no spawn', async () => {
    const sut = decisions;
    const result = await sut();

    assert.equal(result.ok, true);
    assert.match(result.record, /no-op/);
  });
});

describe('propose()', () => {
  it('Given remote, gh, and auth all present, when propose runs, then it pushes and creates a PR and records the outcome', async () => {
    let gitPushCalled = 0;
    let ghPrCreateCalled = 0;
    const deps = {
      hasRemote: () => true,
      ghAvailable: () => true,
      ghAuthed: () => true,
      gitPush: async () => { gitPushCalled++; },
      ghPrCreate: async () => { ghPrCreateCalled++; },
    };

    const sut = propose;
    const result = await sut(deps);

    assert.equal(gitPushCalled, 1);
    assert.equal(ghPrCreateCalled, 1);
    assert.equal(result.ok, true);
    assert.match(result.record, /pushed/);
  });

  it('Given no remote configured, when propose runs, then it returns a recorded no-op without pushing', async () => {
    let gitPushCalled = 0;
    const deps = {
      hasRemote: () => false,
      ghAvailable: () => true,
      ghAuthed: () => true,
      gitPush: async () => { gitPushCalled++; },
      ghPrCreate: async () => {},
    };

    const sut = propose;
    const result = await sut(deps);

    assert.equal(gitPushCalled, 0);
    assert.equal(result.ok, true);
    assert.match(result.record, /no-op/);
  });

  it('Given push fails when remote is present, when propose runs, then it returns a blocker with empty record', async () => {
    const deps = {
      hasRemote: () => true,
      ghAvailable: () => true,
      ghAuthed: () => true,
      gitPush: async () => { throw new Error('push failed: authentication required'); },
      ghPrCreate: async () => {},
    };

    const sut = propose;
    const result = await sut(deps);

    assert.equal(result.ok, false);
    assert.equal(result.blocker.unit, 'propose');
    assert.equal(result.record, '');
  });
});

describe('integrate()', () => {
  it('Given integrate step, when it runs before merge, then it never calls gh pr merge', async () => {
    let ghPrMergeCalled = 0;
    const deps = {
      ghPrMerge: async () => { ghPrMergeCalled++; },
    };

    const sut = integrate;
    const result = await sut(deps);

    assert.equal(ghPrMergeCalled, 0);
    assert.match(result.record, /stopped.*merge/);
  });

  it('Given integrate step, when it runs, then ok is true (the stop is a success outcome, not a blocker)', async () => {
    const sut = integrate;
    const result = await sut({});

    assert.equal(result.ok, true);
  });
});
