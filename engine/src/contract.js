/** Marker embedded in the core bundle for the artifact-handoff carve-out. */
const MARKER_ARTIFACT_HANDOFF = '@@ARTIFACT_HANDOFF@@';

/** Marker embedded in the core bundle for the model-resolution carve-out. */
const MARKER_MODEL_RESOLUTION = '@@MODEL_RESOLUTION@@';

/** Agent-mode text for each carve-out marker. */
const AGENT_VARIANTS = Object.freeze({
  [MARKER_ARTIFACT_HANDOFF]: 'the agent commit is the handoff; a dead agent respawns from the artifact',
  [MARKER_MODEL_RESOLUTION]: 'the role model resolved from manifest→agent-pin→fallback',
});

/** Inline-mode text for each carve-out marker. */
const INLINE_VARIANTS = Object.freeze({
  [MARKER_ARTIFACT_HANDOFF]: 'the commit is the handoff (no agent context to lose)',
  [MARKER_MODEL_RESOLUTION]: 'the session model',
});

/**
 * Replace all carve-out markers in a line with the appropriate variant.
 *
 * @param {string} line
 * @param {boolean} inline
 * @returns {string}
 */
function applyCarveOuts(line, inline) {
  const variants = inline ? INLINE_VARIANTS : AGENT_VARIANTS;
  return Object.entries(variants).reduce(
    (acc, [marker, replacement]) => acc.replaceAll(marker, replacement),
    line,
  );
}

/**
 * Expand the core bundle, applying carve-out variants line by line.
 *
 * @param {string} coreText
 * @param {boolean} inline
 * @returns {string}
 */
function expandCore(coreText, inline) {
  return coreText
    .split('\n')
    .map(line => applyCarveOuts(line, inline))
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
 * Assemble the engine-owned injected contract block for a single phase.
 *
 * Assembly order (fixed):
 *   [U core]
 *   [bundle(s) named by descriptor.contract, in list order]
 *   [derived retrieval note]
 *   [manifest global context verbatim]
 *   [manifest per-phase context verbatim]
 *   [dynamics — reserved for the caller; not assembled here]
 *
 * manifest `context` values are injected verbatim — trusted operator input, not
 * untrusted end-user data.
 *
 * @param {{ id: string, contract: string[] }} descriptor
 * @param {{ context?: unknown, phases?: Record<string, { context?: unknown }> }} manifest
 * @param {{ core: string, producer: string, construction: string, 'harness-read': string, 'harness-exec': string, delivery: string, refinement: string }} fragments
 * @param {{ execution?: string }} opts
 * @returns {string}
 */
export function assembleContract(descriptor, manifest, fragments, opts) {
  const inline = opts.execution === 'inline';
  const sections = [];

  sections.push(expandCore(fragments.core, inline));

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

  return sections.join('\n');
}
