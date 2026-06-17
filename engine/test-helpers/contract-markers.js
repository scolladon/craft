// Markers that must appear in every assembled block (from the core fragment).
// Matched case-insensitively — the assertion proves invariant PRESENCE, never casing.
export const CORE_MARKERS = [
  'never commit on a red gate',
  'Blocker protocol',
  'provenance',
  'suppression',
  'swallowed',
  'Bounded scope',
  'the agent commit is the handoff',
  'the role model resolved',
];

/** Case-insensitive substring presence — the marker proves an invariant, not its casing. */
export function hasCI(haystack, marker) {
  return haystack.toLowerCase().includes(marker.toLowerCase());
}
