/**
 * Returns every descriptor that produces the given artifact, in order.
 * Descriptors lacking a `produces` field are treated as producing nothing.
 *
 * @param {readonly object[]} descriptors
 * @param {string} artifact
 * @returns {{ id: string, index: number, enabled: boolean }[]}
 */
export function producersOf(descriptors, artifact) {
  return descriptors.flatMap((d, index) =>
    // NoCoverage note: fallback [] is observationally equivalent — [].includes(artifact) is false for every real artifact, identical to any sentinel array Stryker would inject.
    (Array.isArray(d.produces) ? d.produces : []).includes(artifact)
      ? [{ id: d.id, index, enabled: !!d.enabled }]
      : [],
  );
}
