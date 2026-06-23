/**
 * Pure manifest emitter — converts an Answers object into a validated-shape
 * { frontmatter, prose } pair and a joined manifest string.
 *
 * No I/O. All keys emitted are members of TOP_KEYS (manifest.js).
 * Per-phase `skip` is never emitted — it is inert in the schema; drops live at `pipeline.skip`.
 * `extends` is never emitted (Tier-2, out of scope).
 * Absent / falsy points are omitted (minimal manifest).
 *
 * Trust boundary: the emitter faithfully forwards the caller's answers into a
 * manifest-shaped string — it does NOT guarantee the result passes `validateManifest`
 * (a missing file-ref, a conflicting policy, or a misspelled phase id round-trips to a
 * lint failure). Output is UNTRUSTED until `manifest-lint` passes; the generator lints a
 * temp file and lands it only on exit 0. Never land emitter output unlinted.
 */

import { dump } from 'js-yaml';

/**
 * @typedef {Object} Answers
 * @property {string}   name         - Config name (used by skill for filename; NOT emitted).
 * @property {string[]} [skip]       - Phases to skip → pipeline.skip.
 * @property {Object}   [models]     - Agent→tier map → models.<agent>.
 * @property {{ part?: string, phase?: string }} [gate] - Gate commands → gates.part / gates.phase.
 * @property {Object}   [execution]  - Phase→mode map → phases.<id>.execution.
 * @property {string}   [profile]    - Execution profile name → pipeline.profile.
 * @property {Object}   [harness]    - Phase→harness knobs → phases.<phase>.harness.
 * @property {{ source: string, ref: string }} [backlog] - Backlog source/ref → backlog.
 * @property {{ source: string, ref: string }} [memory]  - Memory source/ref → memory.
 * @property {{ always?: string[], ask?: string[], never?: string[] }} [policy] - Policy verdicts.
 * @property {string}   [context]    - Global context path → context.
 * @property {Object}   [phaseContext] - Phase→path map → phases.<id>.context.
 * @property {Object}   [override]   - Phase→path map → phases.<id>.override.
 * @property {Object}   [role]       - Phase→path map → phases.<id>.role.
 * @property {Object}   [procedure]  - Phase→path map → phases.<id>.procedure.
 * @property {any[]}    [insert]     - Pipeline inserts → pipeline.insert.
 * @property {string}   [dod]        - DoD artifact path → paths.dod.
 */

const PROSE_HEADER = '# Craft customization\n\nCustomize the craft workflow for this repo.';

/**
 * Merge per-phase entries from multiple source maps into a shared phases object.
 * @param {Object} phases  - Mutable accumulator.
 * @param {Object|undefined} source - Map of phaseId → value.
 * @param {string} field   - The phase field name to set.
 */
function mergePhaseField(phases, source, field) {
  if (!source || typeof source !== 'object') return;
  for (const [id, value] of Object.entries(source)) {
    if (!phases[id]) phases[id] = {};
    // Clone object-valued fields (e.g. harness) so the emitted frontmatter never
    // aliases the caller's answers — the returned object shares no nested references.
    // equivalent mutant (true? / value&&true? / value||...?): all force the clone branch for primitives too;
    // structuredClone on any primitive returns the identical primitive value, so the result is unchanged.
    phases[id][field] = value && typeof value === 'object' ? structuredClone(value) : value;
  }
}

/**
 * Build the gates sub-object from gate answers.
 * @param {{ part?: string, phase?: string }|undefined} gate
 * @returns {Object|undefined}
 */
function buildGates(gate) {
  if (!gate) return undefined;
  const result = {};
  if (gate.part) result.part = gate.part;
  if (gate.phase) result.phase = gate.phase;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Build the pipeline sub-object from skip/profile/insert answers.
 * @param {Answers} answers
 * @returns {Object|undefined}
 */
function buildPipeline(answers) {
  const result = {};
  if (answers.skip && answers.skip.length > 0) result.skip = answers.skip;
  if (answers.profile) result.profile = answers.profile;
  if (answers.insert && answers.insert.length > 0) result.insert = answers.insert;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Build the phases sub-object from all phase-keyed answer fields.
 * @param {Answers} answers
 * @returns {Object|undefined}
 */
function buildPhases(answers) {
  const phases = {};
  mergePhaseField(phases, answers.execution, 'execution');
  mergePhaseField(phases, answers.harness, 'harness');
  mergePhaseField(phases, answers.phaseContext, 'context');
  mergePhaseField(phases, answers.override, 'override');
  mergePhaseField(phases, answers.role, 'role');
  mergePhaseField(phases, answers.procedure, 'procedure');
  return Object.keys(phases).length > 0 ? phases : undefined;
}

/**
 * Convert an Answers object into a { frontmatter, prose } pair.
 * Immutable: never mutates `answers`.
 * @param {Answers} answers
 * @returns {{ frontmatter: Object, prose: string }}
 */
export function emitManifest(answers) {
  const frontmatter = {};

  const pipeline = buildPipeline(answers);
  if (pipeline) frontmatter.pipeline = pipeline;

  if (answers.models && Object.keys(answers.models).length > 0) {
    frontmatter.models = { ...answers.models };
  }

  const gates = buildGates(answers.gate);
  if (gates) frontmatter.gates = gates;

  const phases = buildPhases(answers);
  if (phases) frontmatter.phases = phases;

  if (answers.backlog) frontmatter.backlog = { ...answers.backlog };
  if (answers.memory) frontmatter.memory = { ...answers.memory };
  if (answers.policy) frontmatter.policy = { ...answers.policy };
  if (answers.context) frontmatter.context = answers.context;
  if (answers.dod) frontmatter.paths = { dod: answers.dod };

  return { frontmatter, prose: PROSE_HEADER };
}

/**
 * Join a { frontmatter, prose } pair into a manifest string.
 * Shape: `---\n<yaml-dump>---\n\n<prose>\n`
 * @param {{ frontmatter: Object, prose: string }} param
 * @returns {string}
 */
export function joinManifest({ frontmatter, prose }) {
  const yaml = dump(frontmatter);
  return `---\n${yaml}---\n\n${prose}\n`;
}
