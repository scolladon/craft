import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePipeline } from './descriptor.js';
import { resolvePipeline } from './resolve.js';
import { applyCliOverlay } from './cli-overlay.js';
import { parseManifestContent } from './frontmatter.js';
import { validatePhases, RESERVED_HARNESS_KEYS } from './manifest.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CRAFT_PREFIX = 'craft:';

/**
 * Build the registered external-ref set from a parsed manifest.
 * Collects: extends.agents entries, role of each extends.phases entry,
 * and role of each pipeline.insert entry.
 *
 * @param {object} manifest - parsed manifest object (pre-resolution)
 * @returns {Set<string>}
 */
function buildRegisteredRefSet(manifest) {
  const refs = new Set(manifest.extends?.agents ?? []);
  for (const phase of manifest.extends?.phases ?? []) {
    if (phase.role) refs.add(phase.role);
  }
  for (const phase of manifest.pipeline?.insert ?? []) {
    if (phase.role) refs.add(phase.role);
  }
  return refs;
}

function craftRoleExists(ref) {
  const name = ref.slice(CRAFT_PREFIX.length);
  // A craft role is a bare name under agents/; a separator means a traversal ref
  // that could probe (and falsely satisfy) a file outside agents/ — reject it.
  if (name.includes('/') || name.includes('\\')) return false;
  return existsSync(join(REPO_ROOT, 'agents', name + '.md'));
}

/** Grammar error message for malformed --harness values. */
const HARNESS_GRAMMAR_MSG = 'pipeline-resolve: --harness expects <phase>.<knob>=<value>\n';

/** Prototype keys rejected as --harness phase/knob names so the nested overlay write cannot be poisoned. */
const HARNESS_RESERVED_NAMES = new Set(RESERVED_HARNESS_KEYS);
const HARNESS_RESERVED_MSG = `pipeline-resolve: --harness phase/knob must not be a reserved name (${RESERVED_HARNESS_KEYS.join(', ')})\n`;

/**
 * Coerce a raw string value to the appropriate type for the given harness knob.
 * Best-effort: uncoercible values are returned as the raw string so B4 can reject them.
 *
 * @param {string} knob
 * @param {string} raw
 * @returns {unknown}
 */
function coerceHarnessValue(knob, raw) {
  if (knob === 'passes' || knob === 'max_cycles') {
    const n = Number.parseInt(raw, 10);
    return String(n) === raw ? n : raw;
  }
  if (knob === 'convergence') {
    if (raw === 'low-only' || raw === 'none') return raw;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (knob === 'incremental') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }
  if (knob === 'dimensions') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return raw;
}

/**
 * Parse CLI args into structured options, writing errors to io.stderr.
 * Returns null and signals the error via io when an option error is encountered.
 *
 * @param {string[]} argv
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {{ pipelinePath: string|null, manifestPath: string|null, profile: string|undefined, skip: string[]|undefined, harness: Array<{phase: string, knob: string, value: unknown}>|undefined }|null}
 */
function parseArgs(argv, io) {
  let pipelinePath = null;
  let manifestPath = null;
  let profile;
  let skip;
  let harness;

  const takeValue = (i, flag) => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('-')) {
      io.stderr.write(`pipeline-resolve: option ${flag} requires a non-flag value\n`);
      return null;
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile') {
      const value = takeValue(i, arg);
      if (value === null) return null;
      profile = value;
      i++;
    } else if (arg === '--skip') {
      const value = takeValue(i, arg);
      if (value === null) return null;
      skip = value.split(',').map(s => s.trim()).filter(Boolean);
      i++;
    } else if (arg === '--harness') {
      const value = takeValue(i, arg);
      if (value === null) return null;
      i++;
      const eqIdx = value.indexOf('=');
      if (eqIdx === -1) {
        io.stderr.write(HARNESS_GRAMMAR_MSG);
        return null;
      }
      const lhs = value.slice(0, eqIdx);
      const raw = value.slice(eqIdx + 1);
      const dotIdx = lhs.indexOf('.');
      if (dotIdx === -1 || dotIdx !== lhs.lastIndexOf('.')) {
        io.stderr.write(HARNESS_GRAMMAR_MSG);
        return null;
      }
      const phase = lhs.slice(0, dotIdx);
      const knob = lhs.slice(dotIdx + 1);
      if (!phase || !knob) {
        io.stderr.write(HARNESS_GRAMMAR_MSG);
        return null;
      }
      if (HARNESS_RESERVED_NAMES.has(phase) || HARNESS_RESERVED_NAMES.has(knob)) {
        io.stderr.write(HARNESS_RESERVED_MSG);
        return null;
      }
      harness = harness ?? [];
      harness.push({ phase, knob, value: coerceHarnessValue(knob, raw) });
    } else if (arg.startsWith('-')) {
      io.stderr.write(`pipeline-resolve: unknown option ${arg}\n`);
      return null;
    } else if (pipelinePath === null) {
      pipelinePath = arg;
    } else if (manifestPath === null) {
      manifestPath = arg;
    }
  }

  return { pipelinePath, manifestPath, profile, skip, harness };
}

/**
 * Main entry point for pipeline-resolve logic.
 * All I/O is injected via `io`; returns an exit code — never calls process.*.
 *
 * @param {string[]} argv - process.argv.slice(2) equivalent
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const parsed = parseArgs(argv, io);
  if (parsed === null) return 2;

  const { pipelinePath, manifestPath, profile, skip, harness } = parsed;

  if (!pipelinePath) {
    io.stderr.write('Usage: pipeline-resolve <pipeline.yml> [manifest.yml] [--profile <name>] [--skip <csv>] [--harness <phase>.<knob>=<value>]…\n');
    return 2;
  }

  let defaults;
  try {
    defaults = parsePipeline(readFileSync(pipelinePath, 'utf8'));
  } catch (err) {
    io.stderr.write(`pipeline-resolve: failed to parse pipeline: ${err.message}\n`);
    return 2;
  }

  let manifest = null;
  if (manifestPath) {
    try {
      manifest = parseManifestContent(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      io.stderr.write(`pipeline-resolve: failed to parse manifest: ${err.message}\n`);
      return 2;
    }
  }

  const effectiveManifest = applyCliOverlay(manifest ?? {}, { profile, skip, harness });

  if (harness && harness.length > 0) {
    const touchedPhases = {};
    for (const { phase } of harness) {
      touchedPhases[phase] = effectiveManifest.phases?.[phase] ?? {};
    }
    const revalidationErrors = [];
    validatePhases(touchedPhases, () => true, revalidationErrors);
    if (revalidationErrors.length > 0) {
      for (const error of revalidationErrors) {
        io.stderr.write(`  - ${error}\n`);
      }
      return 2;
    }
  }

  const registeredSet = buildRegisteredRefSet(manifest ?? {});
  const roleExists = ref =>
    ref.startsWith(CRAFT_PREFIX)
      ? craftRoleExists(ref)
      : registeredSet.has(ref);

  let resolution;
  try {
    resolution = resolvePipeline(defaults, effectiveManifest, { roleExists });
  } catch (err) {
    io.stderr.write(`pipeline-resolve: ${err.message}\n`);
    return 2;
  }

  if (!resolution.ok) {
    for (const error of resolution.errors) {
      io.stderr.write(`  - ${error}\n`);
    }
    return 2;
  }

  io.stdout.write(JSON.stringify(resolution, null, 2) + '\n');
  return 0;
}
