/**
 * Gate/waiver decision layer — per-phase gate resolution, code-producing floor,
 * harness-waiver emission, and propose-gate ordering invariant.
 * Pure; no I/O; immutable outputs only.
 */

import { isExecutingHarness } from './exec-harness.js';

/** Artifact that marks a phase as code-producing. */
const CODE_CHANGE_ARTIFACT = 'change';

/**
 * Phase ids whose skip/disable generates a waiver entry.
 * These are the "skippable-but-flagged" harness/refinement phases per ADR-005.
 */
const WAIVABLE_PHASE_IDS = new Set(['review', 'refactoring', 'validation', 'architecture']);

/**
 * The delivery phase whose gate must await all running executing-harnesses.
 */
const PROPOSE_PHASE_ID = 'propose';

/**
 * Placeholder string used when no gate is resolvable but the phase is not code-producing.
 * Empty string signals "no gate required".
 */
const NO_GATE = '';

/**
 * Resolve the effective gate for a single phase.
 * Precedence (highest→lowest): descriptor.gate → manifest.gates[phaseId] → none.
 *
 * @param {object} descriptor
 * @param {object|null|undefined} manifest
 * @returns {string}
 */
function resolveGate(descriptor, manifest) {
  if (descriptor.gate) return descriptor.gate;
  const manifestGates = manifest?.gates;
  if (manifestGates && typeof manifestGates === 'object') {
    const phaseGate = manifestGates[descriptor.id];
    if (typeof phaseGate === 'string' && phaseGate) return phaseGate;
  }
  return NO_GATE;
}

/**
 * Determine whether a descriptor is code-producing (change ∈ produces).
 *
 * @param {object} descriptor
 * @returns {boolean}
 */
function isCodeProducing(descriptor) {
  return descriptor.produces.includes(CODE_CHANGE_ARTIFACT);
}

/**
 * Build the set of executing-harness phase ids that are enabled and running
 * (i.e. in the effective pipeline).
 *
 * @param {readonly object[]} effective
 * @returns {Set<string>}
 */
function runningExecutingHarnessIds(effective) {
  return new Set(
    effective.filter(d => d.enabled && isExecutingHarness(d)).map(d => d.id),
  );
}

/**
 * Build the gate-decision entry for the propose phase.
 * Propose must await every running executing-harness gate.
 *
 * @param {object} proposeDescriptor
 * @param {Set<string>} runningHarnessIds
 * @param {object|null|undefined} manifest
 * @returns {object}
 */
function buildProposeDecision(proposeDescriptor, runningHarnessIds, manifest) {
  return {
    phaseId: proposeDescriptor.id,
    gate: resolveGate(proposeDescriptor, manifest),
    codeProducing: isCodeProducing(proposeDescriptor),
    awaitingHarnesses: [...runningHarnessIds],
  };
}

/**
 * Resolve gate decisions for all effective phases.
 * Returns { gateDecisions, floorErrors } where floorErrors contains refusal messages
 * for code-producing phases with no resolvable gate.
 *
 * @param {readonly object[]} effective
 * @param {object|null|undefined} manifest
 * @param {Set<string>} runningHarnessIds
 * @returns {{ gateDecisions: object[], floorErrors: string[] }}
 */
function resolveGateDecisions(effective, manifest, runningHarnessIds) {
  const gateDecisions = [];
  const floorErrors = [];

  for (const descriptor of effective) {
    if (descriptor.id === PROPOSE_PHASE_ID) {
      gateDecisions.push(buildProposeDecision(descriptor, runningHarnessIds, manifest));
      continue;
    }

    const gate = resolveGate(descriptor, manifest);
    const codeProducing = isCodeProducing(descriptor);

    if (codeProducing && !gate) {
      floorErrors.push(
        `Gate floor violation: phase "${descriptor.id}" produces "change" (code-producing) ` +
        `but has no resolvable gate. A gate is required for all code-producing phases.`,
      );
    }

    gateDecisions.push({
      phaseId: descriptor.id,
      gate,
      codeProducing,
    });
  }

  return { gateDecisions, floorErrors };
}

/**
 * Emit waiver entries for skipped/disabled waivable phases.
 * For executing-harness phases that are waived, also emits a propose-gate release
 * with a loud record entry.
 *
 * Inspects the pre-edit defaults to find waivable phases that are not in effective.
 *
 * @param {readonly object[]} defaults
 * @param {readonly object[]} effective
 * @param {Set<string>} skipSet
 * @param {Map<string, object>} phaseOverrides
 * @returns {{ waivers: object[], waiverRecords: string[] }}
 */
function emitWaivers(defaults, effective, skipSet, phaseOverrides) {
  const effectiveIds = new Set(effective.map(d => d.id));
  const waivers = [];
  const waiverRecords = [];

  for (const descriptor of defaults) {
    if (!WAIVABLE_PHASE_IDS.has(descriptor.id)) continue;

    const isSkipped = skipSet.has(descriptor.id);
    const isExplicitlyDisabled = phaseOverrides.get(descriptor.id)?.enabled === false;
    const shouldWaive = isSkipped || isExplicitlyDisabled;

    if (!shouldWaive) continue;
    if (effectiveIds.has(descriptor.id)) continue; // it's running, no waiver

    const reason = isSkipped ? 'pipeline.skip' : 'phases.enabled:false';
    const executingHarness = isExecutingHarness(descriptor);

    waivers.push({
      phaseId: descriptor.id,
      reason,
      proposeGateReleased: executingHarness,
    });

    if (executingHarness) {
      waiverRecords.push(
        `WAIVER: ${descriptor.id} (${reason}) — executing-harness skipped; ` +
        `propose-gate for ${descriptor.id} is released. ` +
        `Quality guarantee waived — this must be visible in the run record.`,
      );
    }
  }

  return { waivers, waiverRecords };
}

/**
 * Resolve all gate decisions and waivers for a resolved effective pipeline.
 *
 * Returns:
 *   - gateDecisions: per-phase gate resolution entries
 *   - waivers: waiver entries for skipped/disabled waivable phases
 *   - gateRecords: human-readable record entries from gate/waiver decisions
 *   - floorErrors: refusal errors for code-producing phases without gates
 *
 * @param {readonly object[]} defaults   - original defaults before edits
 * @param {readonly object[]} effective  - effective pipeline after all edits (only enabled)
 * @param {object|null|undefined} manifest
 * @param {Set<string>} skipSet
 * @param {Map<string, object>} phaseOverrides
 * @returns {{ gateDecisions: object[], waivers: object[], gateRecords: string[], floorErrors: string[] }}
 */
export function resolveGatesAndWaivers(defaults, effective, manifest, skipSet, phaseOverrides) {
  const runningHarnessIds = runningExecutingHarnessIds(effective);

  const { gateDecisions, floorErrors } = resolveGateDecisions(effective, manifest, runningHarnessIds);
  const { waivers, waiverRecords } = emitWaivers(defaults, effective, skipSet, phaseOverrides);

  return { gateDecisions, waivers, gateRecords: waiverRecords, floorErrors };
}
