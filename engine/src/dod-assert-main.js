/**
 * Main entrypoint for the dod-assert reporter.
 * argv[0] = DoD file path, argv[1] = repo root, argv[2] = comma-separated green phase-ids (optional).
 *
 * CQS query (never a gater): prints a per-criterion report as JSON on stdout and exits 0
 * whenever the DoD is assessable — including a free-text DoD (no structured criteria), which
 * reports { outcomes: null }. A non-zero exit means an OPERATIONAL error only (unreadable file,
 * malformed frontmatter, invalid criteria) — never a verdict. The caller owns escalation.
 *
 * Injection-safe by construction: gate evidence is the separate argv[2] green set (never read
 * from the DoD), and a file-exists probe is containment-bound, so DoD content can neither widen
 * the green set nor escape the repo root. Any command/run field on a criterion is ignored
 * (assertDodCriteria reads only gate/file-exists).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDod, validateDodCriteria, assertDodCriteria, buildGateGreen } from './dod.js';
import { containByRealpath } from './contain.js';

const EXIT_OK = 0;
const EXIT_ERR = 1;

/**
 * Build a containment-bound file-exists predicate. A path escaping repoRoot (lexical, symlink,
 * or realpath ancestor escape) is rejected by containByRealpath → false, never probed outside.
 * @param {string} repoRoot
 * @param {(path: string) => boolean} exists
 * @returns {(relOrAbs: string) => boolean}
 */
function buildFileExists(repoRoot, exists) {
  return (relOrAbs) => {
    const contained = containByRealpath(repoRoot, resolve(repoRoot, relOrAbs));
    return contained !== null && exists(contained);
  };
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ readFile?: (p: string) => string, exists?: (p: string) => boolean }} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const dodPath = argv[0];
  const repoRoot = argv[1];
  const greenCsv = argv[2] ?? ''; // equivalent mutant (default value): the caller always supplies argv[2] (possibly an empty string), so the undefined-fallback value is unreachable in any real invocation
  const readFile = deps.readFile ?? ((p) => readFileSync(p, 'utf8'));
  const exists = deps.exists ?? existsSync;

  if (!dodPath || !repoRoot) {
    io.stderr.write('dod-assert: usage: dod-assert <dod-path> <repo-root> [green-phase-ids-csv]\n');
    return EXIT_ERR;
  }

  let content;
  try {
    content = readFile(dodPath);
  } catch (err) {
    io.stderr.write(`dod-assert: cannot read DoD file ${dodPath}: ${err.message}\n`);
    return EXIT_ERR;
  }

  let parsed;
  try {
    parsed = parseDod(content);
  } catch (err) {
    io.stderr.write(`dod-assert: ${err.message}\n`);
    return EXIT_ERR;
  }

  if (parsed === null) {
    io.stdout.write(`${JSON.stringify({ outcomes: null })}\n`);
    return EXIT_OK;
  }

  const errors = validateDodCriteria(parsed.criteria);
  if (errors.length > 0) {
    for (const message of errors) io.stderr.write(`dod-assert: ${message}\n`);
    return EXIT_ERR;
  }

  // equivalent mutant (filter removal): filter(Boolean) drops empty ids from a malformed csv; a
  // spurious '' could only match a criterion whose gate is the empty string, which no real phase
  // id emits and no valid criterion uses — so its removal changes no observable outcome.
  const greenIds = greenCsv.split(',').map((id) => id.trim()).filter(Boolean);
  const evidence = {
    gateGreen: buildGateGreen(greenIds),
    fileExists: buildFileExists(repoRoot, exists),
  };
  const outcomes = assertDodCriteria(parsed.criteria, evidence).map((outcome, i) => ({
    id: parsed.criteria[i].id,
    kind: parsed.criteria[i].kind,
    outcome,
  }));
  io.stdout.write(`${JSON.stringify({ outcomes })}\n`);
  return EXIT_OK;
}
