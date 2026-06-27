/**
 * Format a single producer entry for a diagnostic message.
 * An enabled producer appears as `<id> (position N, after "<consumerId>")`.
 * A disabled producer appears as `<id> (disabled)`.
 *
 * NOTE: the enabled form "after <consumerId>" assumes the producer is later
 * than the consumer in pipeline order (both call sites pass a later producer).
 *
 * @param {{ id: string, index: number, enabled: boolean }} p
 * @param {string} consumerId
 * @returns {string}
 */
export function formatProducerEntry(p, consumerId) {
  return p.enabled
    ? `${p.id} (position ${p.index}, after "${consumerId}")`
    : `${p.id} (disabled)`;
}

/**
 * Format a list of producers into a diagnostic sentence.
 * Returns emptyText when the list is empty; otherwise joins formatted entries
 * with ', ' and appends '.'.
 *
 * @param {{ id: string, index: number, enabled: boolean }[]} producers
 * @param {string} consumerId
 * @param {string} emptyText
 * @returns {string}
 */
export function formatProducerList(producers, consumerId, emptyText) {
  return producers.length === 0
    ? emptyText
    : producers.map(p => formatProducerEntry(p, consumerId)).join(', ') + '.';
}
