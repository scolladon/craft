import { HARNESS_ARCHETYPE } from './profile.js';

const CONSTRUCTION_ARCHETYPE = 'construction';

const toProduces = (descriptor) =>
  Array.isArray(descriptor.produces) ? descriptor.produces : [];

export const inferArchetype = (descriptor) => {
  if (descriptor.harness !== undefined) {
    return { archetype: HARNESS_ARCHETYPE, reason: 'has harness block' };
  }
  const produces = toProduces(descriptor);
  if (descriptor.gate !== undefined && produces.length === 0) {
    return { archetype: HARNESS_ARCHETYPE, reason: 'gate with no produces' };
  }
  if (produces.length > 0) {
    return { archetype: CONSTRUCTION_ARCHETYPE, reason: `produces [${produces.join(', ')}]` };
  }
  return { archetype: HARNESS_ARCHETYPE, reason: 'fallback — most isolated' };
};

export const inferMissingArchetypes = (descriptors) => {
  const records = [];
  const filled = descriptors.map((d) => {
    if (d.archetype !== undefined) return d;
    const { archetype, reason } = inferArchetype(d);
    records.push(`archetype: ${d.id} → ${archetype} (inferred: ${reason})`);
    return { ...d, archetype };
  });
  return { descriptors: filled, records };
};
