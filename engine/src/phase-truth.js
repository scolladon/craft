// Only an explicit `enabled: false` excludes a descriptor. `??`/`||` idioms
// treat `enabled: false` as falsy-then-defaulted and silently re-include it.
function isEnabled(descriptor) {
  if (Object.prototype.hasOwnProperty.call(descriptor, 'enabled') && descriptor.enabled === false) {
    return false;
  }
  return true;
}

export function enabledPhaseIds(descriptors) {
  return descriptors.filter(isEnabled).map((descriptor) => descriptor.id);
}
