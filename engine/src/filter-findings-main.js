import { readFileSync } from 'node:fs';
import { parseScopeSpec, filterFindings } from './findings.js';

const SCOPE_FLAG = '--scope';
const ROOT_FLAG = '--repo-root';

// Drops are the normal mode under per-hunk scoping, so the enumeration is capped:
// naming every drop would copy a projection of the whole run into the orchestrator's
// context, which is the thing this boundary exists to prevent.
const MAX_NAMED_DROPS = 20;
// Echoed paths come from raw technique output. Same discipline the parse-error path
// uses: truncate, then JSON-escape so newlines and control characters cannot forge
// a second `filter-findings:` line.
const MAX_ECHO_CHARS = 120;

/**
 * Render an untrusted path for a single-line stderr notice.
 * @param {string} file
 * @returns {string}
 */
function echoPath(file) {
  return JSON.stringify(file.length > MAX_ECHO_CHARS ? `${file.slice(0, MAX_ECHO_CHARS)}…` : file);
}

/**
 * Emit a filter-findings error message to stderr.
 * @param {string} message
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {2}
 */
function fail(message, io) {
  io.stderr.write(`filter-findings: ${message}\n`);
  return 2;
}

/**
 * Pulls `--scope <value>` out of argv; whatever positional remains is the
 * input path (or null, meaning stdin).
 *
 * @param {string[]} argv
 * @returns {{ scope: string, repoRoot: string, filePath: string | null } | { error: string }}
 */
function parseArgs(argv) {
  const scopeIndex = argv.indexOf(SCOPE_FLAG);
  if (scopeIndex === -1) {
    return { error: 'missing --scope' };
  }
  const scope = argv[scopeIndex + 1];
  if (scope === undefined) {
    return { error: 'missing --scope value' };
  }
  const rest = [...argv.slice(0, scopeIndex), ...argv.slice(scopeIndex + 2)];

  const rootIndex = rest.indexOf(ROOT_FLAG);
  if (rootIndex !== -1 && rest[rootIndex + 1] === undefined) {
    return { error: `missing ${ROOT_FLAG} value` };
  }
  const repoRoot = rootIndex === -1 ? '' : rest[rootIndex + 1];
  const positionals = rootIndex === -1
    ? rest
    : [...rest.slice(0, rootIndex), ...rest.slice(rootIndex + 2)];

  return { scope, repoRoot, filePath: positionals[0] || null };
}

/**
 * Main entrypoint for filter-findings logic. Consumes a canonical `Finding[]`
 * — never raw technique output, so the engine stays technique-agnostic —
 * and a single comma-joined scope spec, and emits the findings falling
 * inside that scope.
 *
 * @param {string[]} argv — process.argv.slice(2)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void }, readStdin: () => string }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const args = parseArgs(argv);
  if ('error' in args) {
    return fail(args.error, io);
  }
  const { scope, repoRoot, filePath } = args;

  let raw;
  try {
    raw = filePath ? readFileSync(filePath, 'utf8') : io.readStdin();
  } catch (err) {
    return fail(err.message, io);
  }

  let findings;
  let parsedCount;
  let droppedFindings = [];
  try {
    const ranges = parseScopeSpec(scope);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fail('findings input must be a JSON array', io);
    }
    parsedCount = parsed.length;
    findings = filterFindings(parsed, ranges, repoRoot);
    const kept = new Set(findings);
    droppedFindings = parsed.filter(f => !kept.has(f));
  } catch (err) {
    return fail(err.message, io);
  }

  // A scope filter is a safety control, so every drop must be visible — not just
  // the all-dropped case. A mixed payload where one finding matches and a
  // CRITICAL silently vanishes on path shape is the realistic failure, and it is
  // exactly what an aggregate-only notice hides.
  //
  // Two disciplines apply to what gets echoed, because this stderr lands in the
  // orchestrator's context and the values come from raw technique output:
  //   - escape and truncate, so a path carrying newlines cannot forge log lines
  //     (the same rule the parse-error path already applies);
  //   - cap the enumeration, because the trigger condition (path-shape mismatch)
  //     is exactly the condition under which EVERY finding drops.
  const dropped = droppedFindings.length;
  if (dropped > 0) {
    for (const finding of droppedFindings.slice(0, MAX_NAMED_DROPS)) {
      // Name the likeliest cause rather than leaving the operator to guess: an
      // absolute path dropped with no root supplied is the opt-in-flag trap.
      const file = String(finding.file);
      const rootHint = repoRoot === '' && file.startsWith('/')
        ? ' (absolute path, no --repo-root supplied)'
        : '';
      io.stderr.write(
        `filter-findings: dropped ${echoPath(file)}:${Number(finding.line)}`
        + ` — outside the scope${rootHint}\n`,
      );
    }
    if (dropped > MAX_NAMED_DROPS) {
      io.stderr.write(`filter-findings: … and ${dropped - MAX_NAMED_DROPS} more\n`);
    }
    io.stderr.write(
      `filter-findings: ${dropped} of ${parsedCount} finding(s) fell outside the scope — `
      + 'check that the technique emits repo-relative paths matching the spec\n',
    );
  }

  io.stdout.write(JSON.stringify(findings, null, 2) + '\n');
  return 0;
}
