/**
 * Vendor-neutral role→phase vocabulary shared by every binding.
 *
 * craft's roles and phases are its own vocabulary, not a vendor's — the
 * mapping is identical regardless of which agent runtime produced the
 * transcript. What differs per binding is only how the raw role string is
 * extracted from a transcript line (e.g. stripping a vendor-specific agent
 * name prefix); that extraction stays in each adapter and is not this
 * module's concern.
 *
 * No imports: this module is pure vocabulary, safe to import from any
 * binding without pulling in adapter-specific machinery.
 */

/**
 * Map from the role label (agent name after stripping the vendor-specific
 * craft prefix) to the vendor-neutral phase label.
 */
export const ROLE_TO_PHASE = Object.freeze({
  'designer': 'design',
  'planner': 'planning',
  'part-implementer': 'implementation',
  'reviewer': 'review',
  'harness-triager': 'validation',
  'validation-triager': 'validation',
  'docs-writer': 'documentation',
  'backlog-ticker': 'documentation',
  'requirements-writer': 'requirements',
  'refactor-executor': 'refactoring',
});

/**
 * Derive the vendor-neutral phase label from a role string.
 * Returns null for an unknown or falsy role.
 *
 * @param {string | null | undefined} role
 * @returns {string | null}
 */
export function phaseForRole(role) {
  // role is derived from an untrusted sidecar/transcript field — a bare
  // ROLE_TO_PHASE[role] would resolve an inherited Object.prototype member
  // (e.g. role: "constructor" → the Object function) as a truthy-but-wrong
  // phase. Object.hasOwn gates the lookup to the table's own keys only.
  //
  // The type mismatch matters as much as the value: an inherited function
  // survives JSON.stringify as a DROPPED key, and an inherited object
  // serializes as `{}` — either way corrupting a committed report whose
  // schema contracts `string|null`.
  return role && Object.hasOwn(ROLE_TO_PHASE, role) ? ROLE_TO_PHASE[role] : null;
}
