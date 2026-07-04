/**
 * `hygiene-gate` — resolve the hygiene gate posture from a manifest so `ci.sh`
 * can pass `--gate` to the stub/prose lints without embedding YAML parsing in
 * bash. Prints the resolved gate (`advisory` | `blocking`) to stdout. An absent,
 * unreadable, unparseable, or hygiene-less manifest resolves to `advisory` (the
 * safe default); only an explicit but invalid gate value is a loud non-zero.
 */

import { readFileSync } from 'node:fs';
import { parseManifestContent } from './frontmatter.js';
import { HYGIENE_GATES } from './manifest-vocabulary.js';

const DEFAULT_GATE = 'advisory';

/**
 * @param {string[]} argv `[manifestPath]`
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const gate = resolveGate(argv[0], io);
  if (gate === null) return 1; // explicit but invalid gate value (already reported on stderr)
  io.stdout.write(`${gate}\n`);
  return 0;
}

/**
 * @param {string | undefined} manifestPath
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {string | null} the resolved gate, or null for an explicit-but-invalid value
 */
function resolveGate(manifestPath, io) {
  // equivalent mutant (ConditionalExpression → false): with the guard removed, a
  // missing path falls through to readFileSync(undefined), which throws and is
  // caught silently below — same advisory result, no stderr. The guard is kept
  // for intent, not observably distinguishable.
  if (!manifestPath) return DEFAULT_GATE;

  let content;
  try {
    content = readFileSync(manifestPath, 'utf8');
  } catch {
    // Absent/unreadable manifest is the zero-config case — advisory, not an error,
    // and the common path, so it is silent by design.
    return DEFAULT_GATE;
  }

  let manifest;
  try {
    manifest = parseManifestContent(content);
  } catch (e) {
    // A manifest that exists but is malformed is manifest-lint's concern; fail
    // open to advisory but say why on stderr (never swallowed).
    io.stderr.write(`hygiene-gate: cannot parse ${manifestPath}: ${e.message}\n`);
    return DEFAULT_GATE;
  }

  const gate = manifest?.hygiene?.gate;
  if (gate === undefined) return DEFAULT_GATE;
  if (!HYGIENE_GATES.has(gate)) {
    io.stderr.write(`hygiene-gate: unknown hygiene gate: ${gate} (expected one of advisory, blocking)\n`);
    return null;
  }
  return gate;
}
