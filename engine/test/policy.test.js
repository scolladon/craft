import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, symlinkSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';

import {
  POLICY_ACTIONS,
  VERDICTS,
  DEFAULT_VERDICT,
  resolvePolicy,
  mergePolicyScopes,
  normalizePolicyBlock,
  consult,
  containUserPolicyPath,
} from '../src/policy.js';

// ─── POLICY_ACTIONS vocabulary ────────────────────────────────────────────────

test('Given POLICY_ACTIONS, when inspected, then it contains exactly the eight named VCS-port actions', () => {
  const sut = POLICY_ACTIONS;

  const expected = ['isolate', 'commit', 'push', 'propose', 'integrate', 'teardown', 'external-send', 'backlog-write'];

  assert.deepEqual([...sut].sort(), expected.sort());
});

test('Given POLICY_ACTIONS, when inspected, then it is frozen (immutable)', () => {
  const sut = POLICY_ACTIONS;

  assert.throws(() => { sut.push('extra'); }, TypeError);
});

test('Given POLICY_ACTIONS, when checked for engine floors, then never-commit-on-red is absent', () => {
  const sut = POLICY_ACTIONS;

  assert.equal(sut.includes('never-commit-on-red'), false);
});

test('Given POLICY_ACTIONS, when checked for engine floors, then validation-triage-gates-propose is absent', () => {
  const sut = POLICY_ACTIONS;

  assert.equal(sut.includes('validation-triage-gates-propose'), false);
});

test('Given POLICY_ACTIONS, when checked for engine floors, then artifact-handoff is absent', () => {
  const sut = POLICY_ACTIONS;

  assert.equal(sut.includes('artifact-handoff'), false);
});

// ─── VERDICTS ─────────────────────────────────────────────────────────────────

test('Given VERDICTS, when inspected, then it contains exactly always, ask, never', () => {
  const sut = VERDICTS;

  assert.deepEqual([...sut].sort(), ['always', 'ask', 'never']);
});

test('Given VERDICTS, when inspected, then it is frozen (immutable)', () => {
  const sut = VERDICTS;

  assert.throws(() => { sut.push('maybe'); }, TypeError);
});

// ─── DEFAULT_VERDICT per-action defaults ──────────────────────────────────────

test('Given DEFAULT_VERDICT, when inspecting integrate, then default is ask (safe-by-default, Supersede is opt-in)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut.integrate, 'ask');
});

test('Given DEFAULT_VERDICT, when inspecting commit, then default is always (local reversible)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut.commit, 'always');
});

test('Given DEFAULT_VERDICT, when inspecting isolate, then default is always (local reversible)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut.isolate, 'always');
});

test('Given DEFAULT_VERDICT, when inspecting push, then default is ask (remote hard-to-reverse)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut.push, 'ask');
});

test('Given DEFAULT_VERDICT, when inspecting propose, then default is ask (remote outward)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut.propose, 'ask');
});

test('Given DEFAULT_VERDICT, when inspecting teardown, then default is ask (hard, deletes work)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut.teardown, 'ask');
});

test('Given DEFAULT_VERDICT, when inspecting external-send, then default is ask (outward, varies)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut['external-send'], 'ask');
});

test('Given DEFAULT_VERDICT, when inspecting backlog-write, then default is always (local file, reversible)', () => {
  const sut = DEFAULT_VERDICT;

  assert.equal(sut['backlog-write'], 'always');
});

test('Given DEFAULT_VERDICT, when inspected, then it is frozen (immutable)', () => {
  const sut = DEFAULT_VERDICT;

  assert.throws(() => { sut.integrate = 'always'; }, TypeError);
});

// ─── resolvePolicy ────────────────────────────────────────────────────────────

test('Given an effectivePolicy with integrate set to always, when resolvePolicy is called with integrate, then it returns always', () => {
  const sut = resolvePolicy;
  const effectivePolicy = { integrate: 'always' };

  const result = sut('integrate', effectivePolicy);

  assert.equal(result, 'always');
});

test('Given an effectivePolicy with integrate set to never, when resolvePolicy is called with integrate, then it returns never', () => {
  const sut = resolvePolicy;
  const effectivePolicy = { integrate: 'never' };

  const result = sut('integrate', effectivePolicy);

  assert.equal(result, 'never');
});

test('Given an effectivePolicy with integrate set to ask, when resolvePolicy is called with integrate, then it returns ask', () => {
  const sut = resolvePolicy;
  const effectivePolicy = { integrate: 'ask' };

  const result = sut('integrate', effectivePolicy);

  assert.equal(result, 'ask');
});

test('Given an empty effectivePolicy, when resolvePolicy is called with integrate, then it returns the default verdict ask', () => {
  const sut = resolvePolicy;

  const result = sut('integrate', {});

  assert.equal(result, DEFAULT_VERDICT.integrate);
  assert.equal(result, 'ask');
});

test('Given an empty effectivePolicy, when resolvePolicy is called with commit, then it returns the default verdict always', () => {
  const sut = resolvePolicy;

  const result = sut('commit', {});

  assert.equal(result, DEFAULT_VERDICT.commit);
  assert.equal(result, 'always');
});

test('Given an effectivePolicy that does not mention isolate, when resolvePolicy is called with isolate, then it falls back to DEFAULT_VERDICT always', () => {
  const sut = resolvePolicy;
  const effectivePolicy = { integrate: 'never' };

  const result = sut('isolate', effectivePolicy);

  assert.equal(result, 'always');
});

test('Given an unknown action not in POLICY_ACTIONS, when resolvePolicy is called, then it throws', () => {
  const sut = resolvePolicy;

  assert.throws(() => sut('never-commit-on-red', {}), /unknown.*action|invalid.*action|action.*unknown/i);
});

// ─── mergePolicyScopes ────────────────────────────────────────────────────────

test('Given user scope with integrate=ask, when mergePolicyScopes is called with no project or per-invocation, then integrate resolves to ask', () => {
  const sut = mergePolicyScopes;

  const result = sut({ integrate: 'ask' }, {}, {});

  assert.equal(result.integrate, 'ask');
});

test('Given user scope with integrate=ask and project scope with integrate=always, when mergePolicyScopes is called, then project overrides user (last-scope-wins)', () => {
  const sut = mergePolicyScopes;

  const result = sut({ integrate: 'ask' }, { integrate: 'always' }, {});

  assert.equal(result.integrate, 'always');
});

test('Given all three scopes setting integrate to different verdicts, when mergePolicyScopes is called, then per-invocation wins', () => {
  const sut = mergePolicyScopes;

  const result = sut({ integrate: 'never' }, { integrate: 'ask' }, { integrate: 'always' });

  assert.equal(result.integrate, 'always');
});

test('Given user scope with isolate=always and project scope that does not mention isolate, when mergePolicyScopes is called, then user verdict for isolate is preserved', () => {
  const sut = mergePolicyScopes;

  const result = sut({ isolate: 'always' }, { integrate: 'never' }, {});

  assert.equal(result.isolate, 'always');
  assert.equal(result.integrate, 'never');
});

test('Given per-invocation scope overriding only one action, when mergePolicyScopes is called, then other actions from lower scopes remain intact', () => {
  const sut = mergePolicyScopes;

  const result = sut({ commit: 'ask' }, { propose: 'never' }, { integrate: 'always' });

  assert.equal(result.integrate, 'always');
  assert.equal(result.propose, 'never');
  assert.equal(result.commit, 'ask');
});

test('Given null user scope, when mergePolicyScopes is called, then it behaves as empty user scope', () => {
  const sut = mergePolicyScopes;

  const result = sut(null, { integrate: 'always' }, {});

  assert.equal(result.integrate, 'always');
});

test('Given null project scope, when mergePolicyScopes is called, then it behaves as empty project scope', () => {
  const sut = mergePolicyScopes;

  const result = sut({ integrate: 'always' }, null, {});

  assert.equal(result.integrate, 'always');
});

test('Given null per-invocation scope, when mergePolicyScopes is called, then it behaves as empty per-invocation scope', () => {
  const sut = mergePolicyScopes;

  const result = sut({}, { integrate: 'always' }, null);

  assert.equal(result.integrate, 'always');
});

// ─── mergePolicyScopes immutability ───────────────────────────────────────────

test('Given three scope maps, when mergePolicyScopes is called, then the original scope maps are not mutated', () => {
  const sut = mergePolicyScopes;
  const user = Object.freeze({ commit: 'ask' });
  const project = Object.freeze({ integrate: 'never' });
  const perInvocation = Object.freeze({ propose: 'always' });

  const result = sut(user, project, perInvocation);

  assert.deepEqual({ ...user }, { commit: 'ask' });
  assert.deepEqual({ ...project }, { integrate: 'never' });
  assert.deepEqual({ ...perInvocation }, { propose: 'always' });
  assert.notStrictEqual(result, user);
  assert.notStrictEqual(result, project);
  assert.notStrictEqual(result, perInvocation);
});

// ─── mergePolicyScopes idempotence ────────────────────────────────────────────

test('Given the same scope maps merged twice, when mergePolicyScopes is called on each result, then both results are deep-equal', () => {
  const sut = mergePolicyScopes;
  const user = { commit: 'ask' };
  const project = { integrate: 'never' };
  const perInvocation = { propose: 'always' };

  const first = sut(user, project, perInvocation);
  const second = sut(user, project, perInvocation);

  assert.deepEqual(first, second);
});

// ─── mergePolicyScopes + resolvePolicy property test ─────────────────────────

test('Given arbitrary scope combinations over POLICY_ACTIONS x VERDICTS, when resolvePolicy over mergePolicyScopes is called, then it returns the verdict from the highest scope naming the action or DEFAULT_VERDICT', () => {
  const sut = resolvePolicy;

  for (const action of POLICY_ACTIONS) {
    for (const userVerdict of VERDICTS) {
      for (const projectVerdict of VERDICTS) {
        for (const piVerdict of VERDICTS) {
          const user = { [action]: userVerdict };
          const project = { [action]: projectVerdict };
          const perInvocation = { [action]: piVerdict };

          const merged = mergePolicyScopes(user, project, perInvocation);
          const result = sut(action, merged);

          // per-invocation wins (last-scope-wins)
          assert.equal(result, piVerdict, `action=${action} u=${userVerdict} p=${projectVerdict} pi=${piVerdict}`);
        }
      }
    }
  }
});

test('Given user and project scopes but no per-invocation scope, when resolvePolicy over mergePolicyScopes is called, then project verdict wins for named actions', () => {
  const sut = resolvePolicy;

  for (const action of POLICY_ACTIONS) {
    for (const userVerdict of VERDICTS) {
      for (const projectVerdict of VERDICTS) {
        const user = { [action]: userVerdict };
        const project = { [action]: projectVerdict };

        const merged = mergePolicyScopes(user, project, {});
        const result = sut(action, merged);

        assert.equal(result, projectVerdict, `action=${action} u=${userVerdict} p=${projectVerdict}`);
      }
    }
  }
});

test('Given only user scope naming an action, when resolvePolicy over mergePolicyScopes is called, then user verdict is used', () => {
  const sut = resolvePolicy;

  for (const action of POLICY_ACTIONS) {
    for (const userVerdict of VERDICTS) {
      const merged = mergePolicyScopes({ [action]: userVerdict }, {}, {});
      const result = sut(action, merged);

      assert.equal(result, userVerdict, `action=${action} u=${userVerdict}`);
    }
  }
});

test('Given no scope names an action, when resolvePolicy over mergePolicyScopes is called, then DEFAULT_VERDICT is returned', () => {
  const sut = resolvePolicy;

  for (const action of POLICY_ACTIONS) {
    const merged = mergePolicyScopes({}, {}, {});
    const result = sut(action, merged);

    assert.equal(result, DEFAULT_VERDICT[action], `action=${action}`);
  }
});

// ─── normalizePolicyBlock ─────────────────────────────────────────────────────

test('Given an absent block, when normalizePolicyBlock is called, then it returns an empty map', () => {
  const sut = normalizePolicyBlock;

  const result = sut(undefined);

  assert.deepEqual(result, {});
});

test('Given a null block, when normalizePolicyBlock is called, then it returns an empty map', () => {
  const sut = normalizePolicyBlock;

  const result = sut(null);

  assert.deepEqual(result, {});
});

test('Given an empty block, when normalizePolicyBlock is called, then it returns an empty map', () => {
  const sut = normalizePolicyBlock;

  const result = sut({});

  assert.deepEqual(result, {});
});

test('Given a block with always list, when normalizePolicyBlock is called, then each action maps to always', () => {
  const sut = normalizePolicyBlock;
  const block = { always: ['integrate', 'commit'] };

  const result = sut(block);

  assert.equal(result.integrate, 'always');
  assert.equal(result.commit, 'always');
});

test('Given a block with ask list, when normalizePolicyBlock is called, then each action maps to ask', () => {
  const sut = normalizePolicyBlock;
  const block = { ask: ['push', 'propose'] };

  const result = sut(block);

  assert.equal(result.push, 'ask');
  assert.equal(result.propose, 'ask');
});

test('Given a block with never list, when normalizePolicyBlock is called, then each action maps to never', () => {
  const sut = normalizePolicyBlock;
  const block = { never: ['teardown', 'external-send'] };

  const result = sut(block);

  assert.equal(result.teardown, 'never');
  assert.equal(result['external-send'], 'never');
});

test('Given a block with all three verdict lists, when normalizePolicyBlock is called, then all actions are correctly mapped', () => {
  const sut = normalizePolicyBlock;
  const block = {
    always: ['isolate', 'commit'],
    ask: ['push', 'propose'],
    never: ['teardown'],
  };

  const result = sut(block);

  assert.equal(result.isolate, 'always');
  assert.equal(result.commit, 'always');
  assert.equal(result.push, 'ask');
  assert.equal(result.propose, 'ask');
  assert.equal(result.teardown, 'never');
});

test('Given a block with an absent verdict key, when normalizePolicyBlock is called, then it contributes nothing', () => {
  const sut = normalizePolicyBlock;
  const block = { always: ['commit'] };

  const result = sut(block);

  assert.equal(Object.keys(result).length, 1);
  assert.equal(result.commit, 'always');
});

test('Given a block with an empty always list, when normalizePolicyBlock is called, then it contributes no entries', () => {
  const sut = normalizePolicyBlock;
  const block = { always: [], ask: ['integrate'] };

  const result = sut(block);

  assert.equal(Object.keys(result).length, 1);
  assert.equal(result.integrate, 'ask');
});

// ─── consult — Supersede surface ──────────────────────────────────────────────

test('Given integrate with always verdict and claude binding, when consult is called, then surface is proceed (supersedes merge confirmation)', () => {
  const sut = consult;

  const result = sut('integrate', { effectivePolicy: { integrate: 'always' }, binding: 'claude' });

  assert.equal(result.verdict, 'always');
  assert.equal(result.surface, 'proceed');
});

test('Given propose with always verdict and claude binding, when consult is called, then surface is proceed (supersedes pr.creator user stop)', () => {
  const sut = consult;

  const result = sut('propose', { effectivePolicy: { propose: 'always' }, binding: 'claude' });

  assert.equal(result.verdict, 'always');
  assert.equal(result.surface, 'proceed');
});

// ─── consult — safe-by-default (unconfigured integrate still confirms) ─────────

test('Given integrate with no effectivePolicy and claude binding, when consult is called, then surface is ask-then-proceed (safe-by-default)', () => {
  const sut = consult;

  const result = sut('integrate', { effectivePolicy: {}, binding: 'claude' });

  assert.equal(result.verdict, 'ask');
  assert.equal(result.surface, 'ask-then-proceed');
});

// ─── consult — headless degradation ──────────────────────────────────────────

test('Given integrate with no effectivePolicy and pi binding, when consult is called, then surface is degrade-to-blocker (ask degrades headless)', () => {
  const sut = consult;

  const result = sut('integrate', { effectivePolicy: {}, binding: 'pi' });

  assert.equal(result.surface, 'degrade-to-blocker');
});

test('Given integrate with always in effectivePolicy and pi binding, when consult is called, then surface is proceed (pre-approved)', () => {
  const sut = consult;

  const result = sut('integrate', { effectivePolicy: { integrate: 'always' }, binding: 'pi' });

  assert.equal(result.verdict, 'always');
  assert.equal(result.surface, 'proceed');
});

// ─── consult — full verdict × binding matrix ─────────────────────────────────

test('Given never verdict and claude binding, when consult is called, then surface is refuse', () => {
  const sut = consult;

  const result = sut('integrate', { effectivePolicy: { integrate: 'never' }, binding: 'claude' });

  assert.equal(result.verdict, 'never');
  assert.equal(result.surface, 'refuse');
});

test('Given never verdict and pi binding, when consult is called, then surface is refuse', () => {
  const sut = consult;

  const result = sut('integrate', { effectivePolicy: { integrate: 'never' }, binding: 'pi' });

  assert.equal(result.verdict, 'never');
  assert.equal(result.surface, 'refuse');
});

test('Given ask verdict and claude binding, when consult is called, then surface is ask-then-proceed', () => {
  const sut = consult;

  const result = sut('push', { effectivePolicy: { push: 'ask' }, binding: 'claude' });

  assert.equal(result.verdict, 'ask');
  assert.equal(result.surface, 'ask-then-proceed');
});

test('Given ask verdict and pi binding, when consult is called, then surface is degrade-to-blocker', () => {
  const sut = consult;

  const result = sut('push', { effectivePolicy: { push: 'ask' }, binding: 'pi' });

  assert.equal(result.surface, 'degrade-to-blocker');
});

test('Given always verdict and pi binding, when consult is called, then surface is proceed', () => {
  const sut = consult;

  const result = sut('commit', { effectivePolicy: { commit: 'always' }, binding: 'pi' });

  assert.equal(result.verdict, 'always');
  assert.equal(result.surface, 'proceed');
});

// ─── consult — unknown action guard ──────────────────────────────────────────

test('Given an unknown action, when consult is called, then it throws', () => {
  const sut = consult;

  assert.throws(() => sut('artifact-handoff', { effectivePolicy: {}, binding: 'claude' }), /unknown.*action|invalid.*action|action.*unknown/i);
});

// ─── consult — unknown binding guard ─────────────────────────────────────────

test('Given an unknown binding, when consult is called, then it throws with context', () => {
  const sut = consult;

  assert.throws(() => sut('commit', { effectivePolicy: {}, binding: 'bogus' }), /unknown binding/i);
});

// EQUIVALENT (mutation survivors) — consult action-guard at policy.js:153.
// The ConditionalExpression→false and BlockStatement-removal survivors at :153 are
// provably equivalent: resolvePolicy() at line 161 carries an identical POLICY_ACTIONS
// guard and throws with the same observable contract. The outer guard in consult() is
// thus redundant — removing or neutralising it leaves the throw reachable via resolvePolicy.
// Coupling a test to which guard fired would assert an internal implementation detail.

// ─── consult — unknown binding error names valid bindings ────────────────────

test('Given an unknown binding, when consult is called, then the error message names the valid bindings (claude and pi)', () => {
  const sut = consult;

  let caught;
  try {
    sut('commit', { effectivePolicy: {}, binding: 'bogus' });
  } catch (err) {
    caught = err;
  }

  assert.ok(caught, 'expected consult to throw');
  assert.match(caught.message, /claude/);
  assert.match(caught.message, /pi/);
  assert.match(caught.message, /claude.*,.*pi|pi.*,.*claude/);
});

// ─── containUserPolicyPath — traversal-containment helper ────────────────────

test('Given a path inside .claude, when containUserPolicyPath is called, then it returns the path unchanged', () => {
  const sut = containUserPolicyPath;
  const root = join(homedir(), '.claude');
  const path = join(root, 'craft-policy.md');

  const result = sut(root, path);

  assert.equal(result, path);
});

test('Given a path that escapes .claude via traversal, when containUserPolicyPath is called, then it returns null', () => {
  const sut = containUserPolicyPath;
  const root = join(homedir(), '.claude');
  const escapingPath = join(root, '..', 'etc', 'passwd');

  const result = sut(root, escapingPath);

  assert.equal(result, null);
});

test('Given a sibling dir sharing the .claude prefix, when containUserPolicyPath is called, then it returns null', () => {
  const sut = containUserPolicyPath;
  const root = join(homedir(), '.claude');
  const siblingPath = join(homedir(), '.claude-evil', 'craft-policy.md');

  const result = sut(root, siblingPath);

  assert.equal(result, null);
});

test('Given the root path itself, when containUserPolicyPath is called, then it returns the root', () => {
  const sut = containUserPolicyPath;
  const root = join(homedir(), '.claude');

  const result = sut(root, root);

  assert.equal(result, root);
});

// ─── containUserPolicyPath — symlink escape via realpath ──────────────────────

test('Given a symlink inside root pointing outside, when containUserPolicyPath is called, then it returns null', () => {
  const sut = containUserPolicyPath;

  const root = mkdtempSync(join(tmpdir(), 'craft-policy-'));
  const outside = mkdtempSync(join(tmpdir(), 'craft-policy-out-'));
  try {
    symlinkSync(outside, join(root, 'escape'));
    const escapingPath = join(root, 'escape', 'craft-policy.md');

    const result = sut(root, escapingPath);

    assert.equal(result, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('Given a valid in-root non-symlink path, when containUserPolicyPath is called, then it returns the path unchanged', () => {
  const sut = containUserPolicyPath;

  const root = mkdtempSync(join(tmpdir(), 'craft-policy-'));
  try {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'craft-policy.md'), '');
    const target = join(root, 'sub', 'craft-policy.md');

    const result = sut(root, target);

    assert.equal(result, target);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
