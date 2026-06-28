/**
 * Policy resolution — pure, immutable, no I/O module.
 *
 * Exports the canonical action vocabulary, verdict set, per-action defaults,
 * and pure functions for merging scopes and consulting the resolved verdict.
 *
 * Discipline mirrors cli-overlay.js (input never mutated; returned object
 * always freshly constructed) and memory.js (frozen exported constants).
 */

import { resolve as resolvePath } from 'node:path';

import { containByRealpath } from './contain.js';

/**
 * Canonical set of nameable outward/hard-to-reverse actions.
 * Engine invariant floors (never-commit-on-red, validation-triage-gates-propose,
 * artifact-handoff) are NOT included — policy cannot reach them.
 *
 * @type {ReadonlyArray<string>}
 */
export const POLICY_ACTIONS = Object.freeze([
  'isolate',
  'commit',
  'push',
  'propose',
  'integrate',
  'teardown',
  'external-send',
  'backlog-write',
]);

/**
 * The three configurable verdicts.
 *
 * @type {ReadonlyArray<string>}
 */
export const VERDICTS = Object.freeze(['always', 'ask', 'never']);

/**
 * Per-action default verdict keyed by reversibility/outwardness.
 * Remote/irreversible actions default to ask; local reversible actions default to always.
 * Ensures safe-by-default: an unconfigured repo still stops at merge confirmation.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DEFAULT_VERDICT = Object.freeze({
  isolate: 'always',
  commit: 'always',
  push: 'ask',
  propose: 'ask',
  integrate: 'ask',
  teardown: 'ask',
  'external-send': 'ask',
  'backlog-write': 'always',
});

/**
 * Surface outcomes returned by consult.
 * Maps binding × verdict to the concrete surface instruction.
 */
const SURFACE = Object.freeze({
  claude: Object.freeze({
    always: 'proceed',
    ask: 'ask-then-proceed',
    never: 'refuse',
  }),
  pi: Object.freeze({
    always: 'proceed',
    ask: 'degrade-to-blocker',
    never: 'refuse',
  }),
});

/**
 * Resolve the effective verdict for a single action over an already-merged
 * flat effectivePolicy map. Falls back to DEFAULT_VERDICT when action is absent
 * from the map.
 *
 * Pre-condition: action must be a member of POLICY_ACTIONS. An unknown action
 * is a programming error — it is thrown, not swallowed.
 *
 * @param {string} action
 * @param {Record<string, string>} effectivePolicy
 * @returns {string}
 */
export function resolvePolicy(action, effectivePolicy) {
  if (!POLICY_ACTIONS.includes(action)) {
    throw new Error(`resolvePolicy: unknown action '${action}' — must be one of POLICY_ACTIONS`);
  }
  return effectivePolicy[action] ?? DEFAULT_VERDICT[action];
}

/**
 * Merge three policy scope maps into a single flat action→verdict map.
 * Last-scope-wins per action: per-invocation > project > user.
 *
 * Each scope argument is a flat { action: verdict } map (already normalised —
 * use normalizePolicyBlock to convert three-list YAML shape first).
 * Absent/null scopes are treated as empty maps.
 * Inputs are never mutated; result is always a freshly constructed object.
 *
 * @param {Record<string, string>|null|undefined} user
 * @param {Record<string, string>|null|undefined} project
 * @param {Record<string, string>|null|undefined} perInvocation
 * @returns {Record<string, string>}
 */
export function mergePolicyScopes(user, project, perInvocation) {
  return {
    ...(user ?? {}),
    ...(project ?? {}),
    ...(perInvocation ?? {}),
  };
}

/**
 * Normalise a three-list YAML policy block into a flat action→verdict map.
 * Converts { always: [a, b], ask: [c], never: [d] } into
 * { a: 'always', b: 'always', c: 'ask', d: 'never' }.
 *
 * Assumes the block is already validated (no double-verdict per action).
 * Absent/null/empty block returns {}.
 * Absent verdict key contributes nothing to the result.
 *
 * @param {Record<string, string[]>|null|undefined} block
 * @returns {Record<string, string>}
 */
export function normalizePolicyBlock(block) {
  if (!block) return {};

  const result = {};
  for (const verdict of VERDICTS) {
    const actions = block[verdict];
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      result[action] = verdict;
    }
  }
  return result;
}

/**
 * Consult the policy for a single action and binding, returning the resolved
 * verdict and the concrete surface instruction for the caller.
 *
 * CQS-pure: adjudicates only; never performs the governed action.
 *
 * Pre-condition: action must be a member of POLICY_ACTIONS.
 *
 * @param {string} action
 * @param {{ effectivePolicy: Record<string, string>, binding: 'claude' | 'pi' }} ctx
 * @returns {{ verdict: string, surface: string }}
 */
export function consult(action, ctx) {
  if (!POLICY_ACTIONS.includes(action)) {
    throw new Error(`consult: unknown action '${action}' — must be one of POLICY_ACTIONS`);
  }

  const { effectivePolicy, binding } = ctx;
  if (!Object.hasOwn(SURFACE, binding)) {
    throw new Error(`consult: unknown binding '${binding}' — must be one of ${Object.keys(SURFACE).join(', ')}`);
  }
  const verdict = resolvePolicy(action, effectivePolicy);
  const surface = SURFACE[binding][verdict];

  return { verdict, surface };
}

/**
 * Containment check for the user-scope policy file path.
 * Returns the path when it stays within root; returns null when it escapes.
 * Mirrors the discipline of memory.js:resolveStorePath.
 *
 * @param {string} root - absolute root directory (e.g. join(homedir(), '.claude'))
 * @param {string} path - absolute candidate path to validate
 * @returns {string|null}
 */
export function containUserPolicyPath(root, path) {
  return containByRealpath(resolvePath(root), resolvePath(path));
}
