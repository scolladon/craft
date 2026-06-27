/**
 * Strand guard — pre-graph check that a manifest skip does not remove an artifact
 * consumed by an enabled phase that has no self_supply for it.
 * Pure; no I/O.
 */
import { producersOf } from './producers.js';
import { formatProducerList } from './format-producer-entry.js';

/**
 * Build a position map from descriptor id to its index in the effective list.
 * @param {readonly object[]} effective
 * @returns {Map<string, number>}
 */
function buildPositionMap(effective) {
  return new Map(effective.map((d, i) => [d.id, i]));
}

/**
 * Check that no manifest-requested skip strands a non-self-supplying consumer.
 * A default-off descriptor left disabled is NOT a strand.
 * Returns an array of structured error strings (empty = no violations).
 *
 * @param {readonly object[]} defaults  - original defaults BEFORE applying edits
 * @param {Set<string>} skipSet         - set of explicitly-skipped phase ids
 * @param {readonly object[]} effective - the effective descriptor list after edits
 * @returns {string[]}
 */
export function checkStrandedConsumers(defaults, skipSet, effective) {
  const positions = buildPositionMap(effective);
  const errors = [];

  for (const skippedId of skipSet) {
    const skipped = defaults.find(d => d.id === skippedId);
    if (!skipped) continue; // skip of an unknown id — let graph validate handle it

    for (const artifact of skipped.produces) {
      const consumers = effective.filter(
        d => d.enabled && d.consumes.includes(artifact) && !d.self_supply.includes(artifact),
      );

      for (const consumer of consumers) {
        const consumerPos = positions.get(consumer.id) ?? Infinity;
        const hasAlternative = effective.some(d => {
          if (!d.enabled || d.id === skippedId || !d.produces.includes(artifact)) return false;
          const producerPos = positions.get(d.id) ?? Infinity;
          return producerPos < consumerPos;
        });

        if (!hasAlternative) {
          const otherProducers = producersOf(effective, artifact).filter(p => p.id !== skippedId);
          const otherListStr = formatProducerList(otherProducers, consumer.id, 'nothing else in this pipeline.');
          errors.push(
            `Strand: skipping "${skippedId}" removes "${artifact}", consumed by "${consumer.id}" without self_supply.\n` +
            `  "${artifact}" is otherwise produced by: ${otherListStr}\n` +
            `  Did you mean keep "${skippedId}", produces: ["${artifact}"] on an enabled phase before "${consumer.id}",\n` +
            `  or self_supply: ["${artifact}"] on "${consumer.id}"?`,
          );
        }
      }
    }
  }

  return errors;
}
