/**
 * Pipeline resolver — (defaults, manifest) → Resolution.
 * Pure; immutable transforms only; no file I/O.
 *
 * Steps: aliasResolve → validateExecutionValues → expandProfile →
 *        applyEdits → resolveExecution → strandCheck → graphValidate →
 *        resolveGatesAndWaivers → buildManifestRecords
 */

import { resolveAlias } from './alias-map.js';
import { validatePipeline } from './graph.js';
import { expandProfile, applyProfileToArchetype, HARNESS_ARCHETYPE } from './profile.js';
import { DEFAULT_EXECUTION, VALID_EXECUTIONS } from './descriptor.js';
import { applyEnableEdits, applyInserts, applyReorder, checkReorderApplicability } from './edits.js';
import { checkStrandedConsumers } from './strand.js';
import { resolveGatesAndWaivers } from './gates.js';

// ─── step 1: alias-resolve ───────────────────────────────────────────────────

function aliasResolve(manifest) {
  if (!manifest) return {};
  const pipeline = manifest.pipeline ?? {};
  const resolvedSkip = (pipeline.skip ?? []).map(resolveAlias);
  const resolvedInsert = (pipeline.insert ?? []).map(ins => ({
    ...ins,
    after:  ins.after  !== undefined ? resolveAlias(ins.after)  : ins.after,
    before: ins.before !== undefined ? resolveAlias(ins.before) : ins.before,
  }));
  const resolvedPhases = Object.fromEntries(
    Object.entries(manifest.phases ?? {}).map(([k, v]) => [resolveAlias(k), v]),
  );
  const resolvedReorder = (pipeline.reorder ?? []).map(resolveAlias);
  return {
    ...manifest,
    pipeline: { ...pipeline, skip: resolvedSkip, insert: resolvedInsert, reorder: resolvedReorder },
    phases: resolvedPhases,
  };
}

// ─── step 2: validate manifest-supplied execution values ─────────────────────

/** Returns error strings for any manifest execution value not in VALID_EXECUTIONS. */
function validateExecutionValues(manifest) {
  const errors = [];

  const topLevel = manifest.execution;
  if (topLevel !== undefined && !VALID_EXECUTIONS.has(topLevel)) {
    errors.push(
      `Invalid execution value "${topLevel}" in manifest top-level execution. ` +
      `Must be one of: ${[...VALID_EXECUTIONS].join(', ')}.`,
    );
  }

  for (const [id, override] of Object.entries(manifest.phases ?? {})) {
    if (override?.execution !== undefined && !VALID_EXECUTIONS.has(override.execution)) {
      errors.push(
        `Invalid execution value "${override.execution}" in phases.${id}.execution. ` +
        `Must be one of: ${[...VALID_EXECUTIONS].join(', ')}.`,
      );
    }
  }

  for (const ins of manifest.pipeline?.insert ?? []) {
    if (ins?.execution !== undefined && !VALID_EXECUTIONS.has(ins.execution)) {
      errors.push(
        `Invalid execution value "${ins.execution}" in pipeline.insert[id="${ins.id ?? '?'}"].execution. ` +
        `Must be one of: ${[...VALID_EXECUTIONS].join(', ')}.`,
      );
    }
  }

  return errors;
}

// ─── step 3: resolve execution per phase ─────────────────────────────────────

/**
 * Precedence: explicit phase field > profile > top-level default > descriptor default.
 * Harness-archetype caveat: harness phases stay agent under profile and top-level default.
 */
function resolvePhaseExecution(descriptor, phaseOverride, profile, topLevelDefault) {
  if (phaseOverride?.execution !== undefined) return phaseOverride.execution;
  if (profile !== null) return applyProfileToArchetype(profile, descriptor.archetype);
  if (topLevelDefault !== undefined) {
    if (descriptor.archetype === HARNESS_ARCHETYPE) return DEFAULT_EXECUTION;
    return topLevelDefault;
  }
  return descriptor.execution ?? DEFAULT_EXECUTION;
}

function buildExecutionReason(descriptor, override, profile, profileName) {
  if (override?.execution !== undefined) return 'explicit phase field';
  if (profile !== null) {
    const caveat = descriptor.archetype === HARNESS_ARCHETYPE ? 'harness-caveat' : profileName;
    return `profile:${caveat}`;
  }
  return 'top-level default';
}

/** Returns { descriptors, records } — pure; inputs never mutated. */
function resolveExecution(descriptors, phaseOverrides, profile, topLevelDefault, profileName) {
  const records = [];
  const resolved = descriptors.map(d => {
    const override = phaseOverrides.get(d.id);
    const execution = resolvePhaseExecution(d, override, profile, topLevelDefault);
    if (execution !== d.execution) {
      records.push(`execution: ${d.id} → ${execution} (${buildExecutionReason(d, override, profile, profileName)})`);
    }
    return { ...d, execution };
  });
  return { descriptors: resolved, records };
}

// ─── manifest-level record entries ───────────────────────────────────────────

/**
 * Returns the backlog source string when backlog is a valid object with a source,
 * else null. Pure; no I/O; never throws.
 *
 * @param {unknown} backlog
 * @returns {string|null}
 */
function backlogSourceOf(backlog) {
  if (backlog === null || typeof backlog !== 'object' || Array.isArray(backlog)) return null;
  const source = backlog.source;
  if (typeof source !== 'string' || !source) return null;
  return source;
}

/**
 * Build manifest-level record entries for top-level manifest keys that influence
 * the pipeline resolution but are not phase-level edits.
 *
 * @param {object|null|undefined} manifest
 * @returns {string[]}
 */
function buildManifestRecords(manifest) {
  const records = [];
  if (!manifest) return records;

  const source = backlogSourceOf(manifest.backlog);
  if (source === 'file') {
    const ref = manifest.backlog.ref ?? '<default path>';
    records.push(
      `backlog: source "file" (ref: ${ref}) — Backlog.resolve required at input-classify.`,
    );
  } else if (source === 'custom') {
    const ref = manifest.backlog.ref ?? '<unspecified>';
    records.push(
      `backlog: source "custom" (ref: ${ref}) — Backlog.resolve required at input-classify.`,
    );
  }

  const fallback = manifest.models?.fallback;
  if (typeof fallback === 'string' && fallback) {
    records.push(
      `models.fallback: "${fallback}" declared — fallback re-resolution policy active for degraded tiers.`,
    );
  }

  return records;
}

// ─── fold extends.phases into the insert path ────────────────────────────────

/**
 * Merge registered phases into the descriptor list and insert list.
 * - A registered phase whose id matches an existing descriptor → replace in place (full swap).
 * - A registered phase with no match → append to inserts for applyInserts.
 *
 * @param {object[]} descriptors  post-applyEnableEdits list
 * @param {object[]} registeredPhases  manifest.extends.phases (may be empty)
 * @returns {{ descriptors: object[], inserts: object[] }}
 */
function foldRegisteredPhases(descriptors, registeredPhases) {
  if (!registeredPhases || registeredPhases.length === 0) {
    return { descriptors, inserts: [] };
  }
  const inserts = [];
  let result = [...descriptors];
  for (const reg of registeredPhases) {
    const idx = result.findIndex(d => d.id === reg.id);
    if (idx !== -1) {
      const replaced = {
        enabled: true, contract: [], consumes: [], produces: [], self_supply: [],
        execution: DEFAULT_EXECUTION, ...reg,
      };
      result = [...result.slice(0, idx), replaced, ...result.slice(idx + 1)];
    } else {
      inserts.push(reg);
    }
  }
  return { descriptors: result, inserts };
}

// ─── main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a default descriptor list against a manifest to produce the effective pipeline.
 *
 * @param {readonly object[]} defaults
 * @param {object|null|undefined} manifest
 * @returns {{ ok: boolean, errors: string[], effective: object[], record: string[], gateDecisions: object[], waivers: object[] }}
 */
export function resolvePipeline(defaults, manifest, opts) {
  const resolved = aliasResolve(manifest);
  const roleExists = typeof opts?.roleExists === 'function' ? opts.roleExists : () => true;

  const execErrors = validateExecutionValues(resolved);
  if (execErrors.length > 0) {
    return { ok: false, errors: execErrors, effective: [], record: [], gateDecisions: [], waivers: [] };
  }

  let profile;
  try {
    profile = resolved.pipeline?.profile
      ? expandProfile(resolved.pipeline.profile, resolved.extends?.profiles ?? {})
      : null;
  } catch (e) {
    return { ok: false, errors: [e.message], effective: [], record: [], gateDecisions: [], waivers: [] };
  }

  const profileName = resolved.pipeline?.profile;
  const skipSet = new Set(resolved.pipeline?.skip ?? []);
  const phaseOverrides = new Map(Object.entries(resolved.phases ?? {}));

  const enableResult = applyEnableEdits([...defaults], skipSet, phaseOverrides);
  const foldResult = foldRegisteredPhases(enableResult.descriptors, resolved.extends?.phases ?? []);
  const allInserts = [...(resolved.pipeline?.insert ?? []), ...foldResult.inserts];
  const insertResult = applyInserts(foldResult.descriptors, allInserts);

  const reorderList = resolved.pipeline?.reorder ?? [];
  const reorderErrors = checkReorderApplicability(insertResult.descriptors, reorderList);
  if (reorderErrors.length > 0) {
    // Surface the records computed so far (enable + insert), consistent with the strand
    // and graph early-returns below, so a failed reorder still shows the prior edits.
    return {
      ok: false,
      errors: reorderErrors,
      effective: [],
      record: [...enableResult.records, ...insertResult.records],
      gateDecisions: [],
      waivers: [],
    };
  }
  const reorderResult = applyReorder(insertResult.descriptors, reorderList);

  const execResult = resolveExecution(
    reorderResult.descriptors, phaseOverrides, profile, resolved.execution, profileName,
  );

  const manifestRecords = buildManifestRecords(resolved);
  const record = [
    ...enableResult.records,
    ...insertResult.records,
    ...reorderResult.records,
    ...execResult.records,
    ...manifestRecords,
  ];

  const strandErrors = checkStrandedConsumers(defaults, skipSet, execResult.descriptors);
  if (strandErrors.length > 0) {
    return { ok: false, errors: strandErrors, effective: [], record, gateDecisions: [], waivers: [] };
  }

  const validation = validatePipeline(execResult.descriptors);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, effective: [], record, gateDecisions: [], waivers: [] };
  }

  const effective = execResult.descriptors.filter(d => d.enabled);

  const roleErrors = effective
    .filter(d => d.role && !roleExists(d.role))
    .map(d => `phases.${d.id}.role: "${d.role}" does not resolve to an installed agent`);
  if (roleErrors.length > 0) {
    return { ok: false, errors: roleErrors, effective: [], record, gateDecisions: [], waivers: [] };
  }

  const { gateDecisions, waivers, gateRecords, floorErrors } = resolveGatesAndWaivers(
    defaults,
    effective,
    resolved,
    skipSet,
    phaseOverrides,
  );

  if (floorErrors.length > 0) {
    return { ok: false, errors: floorErrors, effective: [], record: [...record, ...gateRecords], gateDecisions: [], waivers: [] };
  }

  return {
    ok: true,
    errors: [],
    effective,
    record: [...record, ...gateRecords],
    gateDecisions,
    waivers,
  };
}
