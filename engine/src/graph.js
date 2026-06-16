/** Closed bundle vocabulary — every contract name must be in this set. */
export const BUNDLE_VOCAB = new Set([
  'core', 'producer', 'construction', 'harness-read', 'harness-exec', 'delivery', 'refinement',
]);

/**
 * Find the nearest earlier enabled descriptor that produces the given artifact.
 * Returns the descriptor or undefined if none exists.
 *
 * @param {readonly object[]} descriptors
 * @param {number} consumerIndex
 * @param {string} artifact
 * @returns {object|undefined}
 */
function nearestEarlierProducer(descriptors, consumerIndex, artifact) {
  for (let i = consumerIndex - 1; i >= 0; i--) {
    const d = descriptors[i];
    if (d.enabled && d.produces.includes(artifact)) {
      return d;
    }
  }
  return undefined;
}

/**
 * Check that all ids in the pipeline are unique.
 * @param {readonly object[]} descriptors
 * @returns {string[]}
 */
function checkUniqueIds(descriptors) {
  const seen = new Set();
  const errors = [];
  for (const d of descriptors) {
    if (seen.has(d.id)) {
      errors.push(`Duplicate descriptor id "${d.id}".`);
    }
    seen.add(d.id);
  }
  return errors;
}

/**
 * Check that every self_supply list is a subset of the corresponding consumes list.
 * @param {readonly object[]} descriptors
 * @returns {string[]}
 */
function checkSelfSupplySubset(descriptors) {
  const errors = [];
  for (const d of descriptors) {
    for (const artifact of d.self_supply) {
      if (!d.consumes.includes(artifact)) {
        errors.push(
          `Descriptor "${d.id}": self_supply artifact "${artifact}" is not in consumes [${d.consumes.join(', ')}].`,
        );
      }
    }
  }
  return errors;
}

/**
 * Check that every consumed artifact either has a nearest earlier enabled producer
 * or is listed in that consumer's self_supply.
 * @param {readonly object[]} descriptors
 * @returns {string[]}
 */
function checkEdgesSatisfied(descriptors) {
  const errors = [];
  for (let i = 0; i < descriptors.length; i++) {
    const d = descriptors[i];
    if (!d.enabled) continue;
    for (const artifact of d.consumes) {
      if (d.self_supply.includes(artifact)) continue;
      const producer = nearestEarlierProducer(descriptors, i, artifact);
      if (!producer) {
        errors.push(
          `Descriptor "${d.id}": consumes artifact "${artifact}" but no earlier enabled descriptor produces it, ` +
          `and it is not in self_supply.`,
        );
      }
    }
  }
  return errors;
}

/**
 * Check that all contract bundle names are within the closed vocabulary.
 * @param {readonly object[]} descriptors
 * @returns {string[]}
 */
function checkBundleVocab(descriptors) {
  const errors = [];
  for (const d of descriptors) {
    for (const bundle of d.contract) {
      if (!BUNDLE_VOCAB.has(bundle)) {
        errors.push(
          `Descriptor "${d.id}": contract bundle "${bundle}" is not in the closed vocabulary ` +
          `[${[...BUNDLE_VOCAB].join(', ')}].`,
        );
      }
    }
  }
  return errors;
}

/**
 * Validate the pipeline descriptor list.
 * Returns { ok: boolean, errors: string[] }.
 * Pure — does not throw.
 *
 * @param {readonly object[]} descriptors
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePipeline(descriptors) {
  // Acyclicity needs no separate pass: edges resolve only to *earlier* producers
  // (nearestEarlierProducer), so any cyclic or forward dependency surfaces as a
  // dangling consume in checkEdgesSatisfied.
  const errors = [
    ...checkUniqueIds(descriptors),
    ...checkSelfSupplySubset(descriptors),
    ...checkBundleVocab(descriptors),
    ...checkEdgesSatisfied(descriptors),
  ];

  return { ok: errors.length === 0, errors };
}
