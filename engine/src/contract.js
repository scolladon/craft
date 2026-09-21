import { isExecutingHarness } from './exec-harness.js';

/**
 * Marker embedded in the core bundle for the artifact-handoff carve-out.
 * EXECUTION-MODE axis: text differs between agent and inline, never the descriptor.
 */
const MARKER_ARTIFACT_HANDOFF = '@@ARTIFACT_HANDOFF@@';

/**
 * Marker embedded in the core bundle for the model-resolution carve-out.
 * EXECUTION-MODE axis: text differs between agent and inline, never the descriptor.
 */
const MARKER_MODEL_RESOLUTION = '@@MODEL_RESOLUTION@@';

/**
 * Marker embedded in the core bundle for the turn-budget line.
 * DESCRIPTOR axis: resolves from manifest/descriptor/archetype, never the execution
 * mode — it must render identical text in agent and inline mode (see assembleContract).
 */
const MARKER_TURN_BUDGET = '@@TURN_BUDGET@@';

/** Agent-mode text for each execution-mode carve-out marker. */
const AGENT_VARIANTS = Object.freeze({
  [MARKER_ARTIFACT_HANDOFF]: 'the agent commit is the handoff; a dead agent respawns from the artifact',
  [MARKER_MODEL_RESOLUTION]: 'the role model resolved from manifest→agent-pin→fallback',
});

/** Inline-mode text for each execution-mode carve-out marker. */
const INLINE_VARIANTS = Object.freeze({
  [MARKER_ARTIFACT_HANDOFF]: 'the commit is the handoff (no agent context to lose)',
  [MARKER_MODEL_RESOLUTION]: 'the session model',
});

/**
 * Per-archetype turn-budget default, consulted when neither the manifest nor the
 * descriptor declares one. `setup` spawns no agent, so it degrades to `null` (no
 * budget, run to completion) rather than a number. Exported so a test can assert
 * it covers every member of VALID_ARCHETYPES — a new archetype must not be
 * addable without a budget decision. This table is the SINGLE live home for
 * the defaults: pipeline/default.yml declares no turn_budget, so editing a
 * value here changes real behaviour for every shipped phase. A descriptor may
 * still declare one to deviate, and a manifest still wins over both.
 */
export const ARCHETYPE_TURN_BUDGET = Object.freeze({
  setup: null,
  specification: 100,
  construction: 150,
  harness: 60,
  refinement: 130,
  delivery: 150,
});

/**
 * The executing-harness archetype shares its archetype string with the read-harness
 * archetype; this is what splits the two apart when no explicit budget is declared.
 */
const EXECUTING_HARNESS_TURN_BUDGET = 150;

/**
 * Look up the archetype-table turn budget for a descriptor, splitting the harness
 * archetype into its executing/read halves. `isExecutingHarness` reads
 * `descriptor.contract` — called only when it is an array, since this resolution
 * runs ahead of assembleContract's own bundle-name loop and must not throw a worse
 * message than that loop would. `Object.hasOwn` (not a bare lookup) keeps an
 * archetype string like "constructor" from resolving an inherited Object member.
 *
 * @param {{ archetype?: string, contract?: unknown }} descriptor
 * @returns {number|null}
 */
export function archetypeBudget(descriptor) {
  if (Array.isArray(descriptor.contract) && isExecutingHarness(descriptor)) {
    return EXECUTING_HARNESS_TURN_BUDGET;
  }
  return Object.hasOwn(ARCHETYPE_TURN_BUDGET, descriptor.archetype)
    ? ARCHETYPE_TURN_BUDGET[descriptor.archetype]
    : null;
}

/**
 * Resolve the turn budget for a descriptor: manifest override, then the
 * descriptor's own declaration, then the archetype table, then no budget.
 * Mirrors the Model port's manifest→descriptor→default resolution shape.
 *
 * @param {{ id: string }} descriptor
 * @param {{ phases?: Record<string, { turn_budget?: number }> }|null|undefined} manifest
 * @returns {number|null}
 */
function resolveTurnBudget(descriptor, manifest) {
  return (
    manifest?.phases?.[descriptor.id]?.turn_budget ??
    descriptor.turn_budget ??
    archetypeBudget(descriptor) ??
    null
  );
}

/**
 * Render the turn-budget line text. Mode-neutral by construction — the unit
 * (tool calls, not turns) is named so an agent that cannot observe a billed
 * turn can still self-count and enforce the budget.
 *
 * @param {number|null} budget
 * @returns {string}
 */
function turnBudgetText(budget) {
  if (budget === null) return 'none declared for this phase — run to completion.';
  return `~${budget} tool calls for this phase. On reaching it, commit what is green, ` +
    'write a handback (done / remains / next RED), and return — never continue past it. ' +
    'The unit of work resumes from the artifact with a fresh context.';
}

/**
 * Replace all markers in a line with their variant text.
 *
 * @param {string} line
 * @param {Record<string, string>} variants
 * @returns {string}
 */
function applyCarveOuts(line, variants) {
  return Object.entries(variants).reduce(
    (acc, [marker, replacement]) => acc.replaceAll(marker, replacement),
    line,
  );
}

/**
 * Expand the core bundle, applying marker variants line by line.
 *
 * @param {string} coreText
 * @param {Record<string, string>} variants
 * @returns {string}
 */
function expandCore(coreText, variants) {
  return coreText
    .split('\n')
    .map(line => applyCarveOuts(line, variants))
    .join('\n');
}

/**
 * Derive and return the retrieval strategy note injected by the engine.
 * The note is computed here — never stored in bundle fragments.
 *
 * @returns {string}
 */
function deriveRetrievalNote() {
  return 'retrieval: use project-level tools first, then env-level, then user-level, then native read/grep.';
}

/**
 * Extract a context value (string or array) from a manifest field.
 *
 * @param {unknown} value
 * @returns {string}
 */
function extractContext(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.join('\n');
  return String(value);
}

/**
 * Render the declarative "tools declared for this phase" line, or null when
 * the phase has no `tools` entry. Declarative only: the Agent/Task spawn
 * surface has no `tools` parameter, so this line documents intent for a
 * reader — it never widens what the spawned agent can call. Reads only the
 * manifest, so it resolves identically in agent and inline mode.
 *
 * @param {unknown} manifest
 * @param {string} phaseId
 * @returns {string|null}
 */
function renderPhaseToolsLine(manifest, phaseId) {
  const tools = manifest?.phases?.[phaseId]?.tools;
  const list = typeof tools === 'string' ? [tools] : tools;
  if (!Array.isArray(list) || list.length === 0) return null;
  return `Tools declared for this phase: ${list.join(', ')} — declarative; the agent definition's allowlist is what binds at spawn.`;
}

/**
 * Assemble the engine-owned injected contract block for a single phase.
 *
 * Assembly order (fixed):
 *   [U core]
 *   [bundle(s) named by descriptor.contract, in list order]
 *   [derived retrieval note]
 *   [manifest global context verbatim]
 *   [manifest per-phase context verbatim]
 *   [declarative tools line, when phases.<id>.tools is declared]
 *   [dynamics — reserved for the caller; not assembled here]
 *
 * The U core's markers resolve on two independent axes: the execution-mode carve-outs
 * (artifact-handoff, model-resolution) key off `opts.execution`, while the turn-budget
 * marker keys off the descriptor/manifest regardless of execution mode — both axes are
 * folded into one `variants` map before expandCore runs, so the reducer stays agnostic
 * to which axis produced which replacement.
 *
 * manifest `context` values are injected verbatim — trusted operator input, not
 * untrusted end-user data.
 *
 * @param {{ id: string, contract: string[], archetype?: string, turn_budget?: number|null }} descriptor
 * @param {{ context?: unknown, phases?: Record<string, { context?: unknown, tools?: unknown, turn_budget?: number }> }|null|undefined} manifest
 * @param {{ core: string, producer: string, construction: string, 'harness-read': string, 'harness-exec': string, delivery: string, refinement: string }} fragments
 * @param {{ execution?: string }} opts
 * @returns {string}
 */
export function assembleContract(descriptor, manifest, fragments, opts) {
  const inline = opts.execution === 'inline';
  const sections = [];

  const variants = {
    ...(inline ? INLINE_VARIANTS : AGENT_VARIANTS),
    [MARKER_TURN_BUDGET]: turnBudgetText(resolveTurnBudget(descriptor, manifest)),
  };
  sections.push(expandCore(fragments.core, variants));

  for (const bundleName of descriptor.contract) {
    if (!Object.hasOwn(fragments, bundleName)) {
      throw new Error(`Unknown contract bundle: "${bundleName}"`);
    }
    sections.push(fragments[bundleName]);
  }

  sections.push(deriveRetrievalNote());

  const globalCtx = extractContext(manifest?.context);
  if (globalCtx) sections.push(globalCtx);

  const phaseCtx = extractContext(manifest?.phases?.[descriptor.id]?.context);
  if (phaseCtx) sections.push(phaseCtx);

  const toolsLine = renderPhaseToolsLine(manifest, descriptor.id);
  if (toolsLine) sections.push(toolsLine);

  return sections.join('\n');
}
