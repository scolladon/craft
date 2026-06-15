/**
 * Pipeline resolver — (defaults, manifest) → Resolution.
 * Pure; immutable transforms only; no file I/O.
 *
 * Steps (in order):
 *   aliasResolve → expandProfiles → applyEdits → resolveExecution → validate
 */

import { resolveAlias } from './alias-map.js';
import { validatePipeline } from './graph.js';
import { expandProfile, applyProfileToArchetype } from './profile.js';

// ─── step 1: alias-resolve manifest id references ────────────────────────────

/**
 * Resolve all phase ids named in the manifest to their canonical ids.
 * Returns a new manifest object with resolved ids; input is never mutated.
 *
 * @param {object|null|undefined} manifest
 * @returns {object}
 */
function aliasResolve(manifest) {
  if (!manifest) return {};

  const pipeline = manifest.pipeline ?? {};
  const phases = manifest.phases ?? {};

  const resolvedSkip = (pipeline.skip ?? []).map(resolveAlias);

  const resolvedInsert = (pipeline.insert ?? []).map(ins => ({
    ...ins,
    after:  ins.after  !== undefined ? resolveAlias(ins.after)  : ins.after,
    before: ins.before !== undefined ? resolveAlias(ins.before) : ins.before,
  }));

  const resolvedPhases = Object.fromEntries(
    Object.entries(phases).map(([k, v]) => [resolveAlias(k), v]),
  );

  return {
    ...manifest,
    pipeline: { ...pipeline, skip: resolvedSkip, insert: resolvedInsert },
    phases: resolvedPhases,
  };
}

// ─── step 2: expand profile into per-phase execution edits ───────────────────

/**
 * Extract the expanded profile from the manifest (if any).
 * Returns null when no profile is set.
 *
 * @param {object} manifest
 * @returns {{ defaultExecution: string, harnessStaysAgent: boolean }|null}
 */
function expandProfiles(manifest) {
  const profileName = manifest.pipeline?.profile;
  if (!profileName) return null;
  return expandProfile(profileName);
}

// ─── step 3: apply edits (skip / insert / phase field overrides) ─────────────

/**
 * Build the skip set from the manifest.
 * @param {object} manifest
 * @returns {Set<string>}
 */
function buildSkipSet(manifest) {
  return new Set(manifest.pipeline?.skip ?? []);
}

/**
 * Build a map of per-phase field overrides from manifest.phases.
 * @param {object} manifest
 * @returns {Map<string, object>}
 */
function buildPhaseOverrides(manifest) {
  return new Map(Object.entries(manifest.phases ?? {}));
}

/**
 * Apply skip + phase-level enable/disable overrides to the default descriptor list.
 * Returns a new array — input descriptors are never mutated.
 * Records each applied edit in the record array.
 *
 * A descriptor with enabled:false can be turned on with phases.<id>.enabled:true.
 * A manifest skip sets enabled:false for that phase.
 *
 * @param {readonly object[]} defaults
 * @param {Set<string>} skipSet
 * @param {Map<string, object>} phaseOverrides
 * @param {string[]} record
 * @returns {object[]}
 */
function applyEnableEdits(defaults, skipSet, phaseOverrides, record) {
  return defaults.map(d => {
    const override = phaseOverrides.get(d.id) ?? {};
    const explicitSkip = skipSet.has(d.id);
    const explicitEnable = override.enabled === true;
    const explicitDisable = override.enabled === false;

    let enabled = d.enabled;

    if (explicitSkip) {
      enabled = false;
      record.push(`skip: ${d.id} (manifest pipeline.skip)`);
    } else if (explicitEnable && !d.enabled) {
      enabled = true;
      record.push(`enable: ${d.id} (phases.${d.id}.enabled:true)`);
    } else if (explicitDisable && d.enabled) {
      enabled = false;
      record.push(`disable: ${d.id} (phases.${d.id}.enabled:false)`);
    } else if (!d.enabled) {
      record.push(`default-skip: ${d.id} (descriptor enabled:false)`);
    }

    // Apply other field overrides (role, model, harness, execution) except enabled
    // (enabled is handled above; execution is handled in step 4)
    const { enabled: _e, execution: _ex, ...otherOverrides } = override;
    void _e; void _ex;

    return { ...d, ...otherOverrides, enabled };
  });
}

/**
 * Insert new descriptors from manifest.pipeline.insert into the descriptor list.
 * Each insert entry may have after: or before: to place it relative to an existing phase.
 * Inserted phases are normalized with sensible defaults.
 *
 * @param {object[]} descriptors
 * @param {object[]} inserts
 * @param {string[]} record
 * @returns {object[]}
 */
function applyInserts(descriptors, inserts, record) {
  if (!inserts || inserts.length === 0) return descriptors;

  let result = [...descriptors];

  for (const ins of inserts) {
    const { after, before, ...phaseData } = ins;

    const newDescriptor = {
      enabled: true,
      contract: [],
      consumes: [],
      produces: [],
      self_supply: [],
      execution: 'agent',
      ...phaseData,
    };

    let insertIdx = result.length; // default: append at end

    if (after !== undefined) {
      const refIdx = result.findIndex(d => d.id === after);
      if (refIdx !== -1) insertIdx = refIdx + 1;
    } else if (before !== undefined) {
      const refIdx = result.findIndex(d => d.id === before);
      if (refIdx !== -1) insertIdx = refIdx;
    }

    result = [
      ...result.slice(0, insertIdx),
      newDescriptor,
      ...result.slice(insertIdx),
    ];

    record.push(`insert: ${newDescriptor.id} (${after ? `after:${after}` : before ? `before:${before}` : 'append'})`);
  }

  return result;
}

// ─── step 4: resolve execution per phase ─────────────────────────────────────

/**
 * Resolve effective execution for one phase using ADR-008 precedence:
 *   explicit phase field > profile > top-level execution default > descriptor default
 *
 * The SP1 parallelism caveat (harness archetype stays agent) is applied as a static
 * rule at the profile level via applyProfileToArchetype.
 *
 * @param {object} descriptor
 * @param {object|undefined} phaseOverride
 * @param {{ defaultExecution: string, harnessStaysAgent: boolean }|null} profile
 * @param {string|undefined} topLevelDefault
 * @returns {'inline'|'agent'}
 */
function resolvePhaseExecution(descriptor, phaseOverride, profile, topLevelDefault) {
  // Explicit phase field wins unconditionally
  if (phaseOverride?.execution !== undefined) {
    return phaseOverride.execution;
  }

  // Profile (respects harness-archetype caveat)
  if (profile !== null) {
    return applyProfileToArchetype(profile, descriptor.archetype);
  }

  // Top-level execution default overrides descriptor default
  // Harness archetype still stays agent: the SP1 caveat is a static rule
  if (topLevelDefault !== undefined) {
    if (descriptor.archetype === 'harness') return 'agent';
    return topLevelDefault;
  }

  // Descriptor default
  return descriptor.execution ?? 'agent';
}

/**
 * Apply execution resolution to every descriptor in the list.
 * Returns new descriptors; inputs are never mutated.
 *
 * @param {object[]} descriptors
 * @param {Map<string, object>} phaseOverrides
 * @param {{ defaultExecution: string, harnessStaysAgent: boolean }|null} profile
 * @param {string|undefined} topLevelDefault
 * @param {string[]} record
 * @returns {object[]}
 */
function resolveExecution(descriptors, phaseOverrides, profile, topLevelDefault, record) {
  return descriptors.map(d => {
    const override = phaseOverrides.get(d.id);
    const resolved = resolvePhaseExecution(d, override, profile, topLevelDefault);

    if (resolved !== d.execution) {
      const reason = override?.execution !== undefined
        ? 'explicit phase field'
        : profile !== null
          ? `profile:${d.archetype === 'harness' ? 'harness-caveat' : 'solo'}`
          : 'top-level default';
      record.push(`execution: ${d.id} → ${resolved} (${reason})`);
    }

    return { ...d, execution: resolved };
  });
}

// ─── step 5: strand-check and validate ───────────────────────────────────────

/**
 * Check that no manifest-requested skip strands a non-self-supplying consumer.
 * A default-off descriptor left disabled is NOT a strand.
 * Returns an array of structured error strings (empty = no violations).
 *
 * @param {readonly object[]} defaults  - original defaults BEFORE applying edits
 * @param {Set<string>} skipSet         - set of explicitly-skipped phase ids
 * @param {object[]} effective          - the effective descriptor list after edits
 * @returns {string[]}
 */
function checkStrandedConsumers(defaults, skipSet, effective) {
  const errors = [];

  for (const skippedId of skipSet) {
    const skipped = defaults.find(d => d.id === skippedId);
    if (!skipped) continue; // skip of an unknown id — let graph validate handle it

    for (const artifact of skipped.produces) {
      // Find all enabled consumers of this artifact in the effective list
      const consumers = effective.filter(
        d => d.enabled && d.consumes.includes(artifact) && !d.self_supply.includes(artifact),
      );

      for (const consumer of consumers) {
        // Is the artifact still covered by an enabled producer (other than the skipped one)?
        const hasAlternative = effective.some(
          d => d.enabled && d.id !== skippedId && d.produces.includes(artifact) &&
               effective.indexOf(d) < effective.indexOf(consumer),
        );

        if (!hasAlternative) {
          errors.push(
            `Strand: skipping "${skippedId}" removes artifact "${artifact}" ` +
            `that "${consumer.id}" consumes without self_supply — strand refused.`,
          );
        }
      }
    }
  }

  return errors;
}

// ─── main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a default descriptor list against a manifest to produce the effective pipeline.
 *
 * @param {readonly object[]} defaults - parsed Descriptor[] from parsePipeline
 * @param {object|null|undefined} manifest - already-parsed manifest object (or null/undefined)
 * @returns {{ ok: boolean, errors: string[], effective: object[], record: string[], gateDecisions: [], waivers: [] }}
 */
export function resolvePipeline(defaults, manifest) {
  const record = [];

  // Step 1: alias-resolve all manifest id references
  const resolved = aliasResolve(manifest);

  // Step 2: expand profile
  const profile = expandProfiles(resolved);

  // Step 3: build edit sets
  const skipSet = buildSkipSet(resolved);
  const phaseOverrides = buildPhaseOverrides(resolved);

  // Apply enable/disable edits
  const afterEnableEdits = applyEnableEdits([...defaults], skipSet, phaseOverrides, record);

  // Apply inserts
  const inserts = resolved.pipeline?.insert ?? [];
  const afterInserts = applyInserts(afterEnableEdits, inserts, record);

  // Step 4: resolve execution per phase
  const topLevelDefault = resolved.execution;
  const afterExecResolution = resolveExecution(
    afterInserts, phaseOverrides, profile, topLevelDefault, record,
  );

  // Step 5: validate — strand check then graph validation
  const strandErrors = checkStrandedConsumers(defaults, skipSet, afterExecResolution);
  if (strandErrors.length > 0) {
    return { ok: false, errors: strandErrors, effective: [], record, gateDecisions: [], waivers: [] };
  }

  const validation = validatePipeline(afterExecResolution);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, effective: [], record, gateDecisions: [], waivers: [] };
  }

  // Return only the enabled descriptors in order
  const effective = afterExecResolution.filter(d => d.enabled);

  return { ok: true, errors: [], effective, record, gateDecisions: [], waivers: [] };
}
