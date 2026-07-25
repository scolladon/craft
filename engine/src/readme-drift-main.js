/**
 * README drift-guard orchestrator — reads README.md, pipeline/default.yml and the
 * telemetry report under a resolved root, runs all three sub-guards (manifest snippet,
 * phase names, telemetry claims), and prints every finding it collects. Run-all, not
 * fail-fast: one invocation surfaces every drift at once.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { extractFrontmatter } from './frontmatter.js';
import { validateManifest } from './manifest.js';
import { extractReadmeRegions } from './readme-regions.js';
import { enabledPhaseIds } from './phase-truth.js';
import { recomputeClaims, compareClaims } from './telemetry-claims.js';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXIT_CLEAN = 0;
const EXIT_DRIFT = 1;

const NO_MANIFEST_SNIPPET = 'manifest-snippet: README carries no yaml fenced block to validate';

/**
 * Validate a single README `yaml` snippet body via the exact path manifest-lint uses:
 * wrap as frontmatter, extract, parse, validate.
 * @param {string} block
 * @returns {string[]} findings, empty when the snippet is a valid manifest
 */
function validateSnippetBlock(block) {
  if (block.trim() === '') {
    return ['manifest-snippet: empty yaml block — the README example must show a real manifest'];
  }
  const wrapped = `---\n${block}\n---\nx\n`;
  let parsed;
  try {
    parsed = load(extractFrontmatter(wrapped));
  } catch (err) {
    return [`manifest-snippet: malformed YAML: ${err.message}`];
  }
  const { ok, errors } = validateManifest(parsed, {});
  return ok ? [] : errors.map((error) => `manifest-snippet: ${error}`);
}

/**
 * Sub-guard 1: every `yaml` fenced block in the README must be a valid manifest
 * snippet. A structurally-absent snippet (zero blocks) is itself a finding.
 * @param {string[]} yamlBlocks
 * @returns {string[]} findings
 */
function manifestSnippetFindings(yamlBlocks) {
  if (yamlBlocks.length === 0) return [NO_MANIFEST_SNIPPET];
  return yamlBlocks.flatMap(validateSnippetBlock);
}

/**
 * Set-diff a README-extracted phase list against the truth set, naming ids
 * missing from the README surface and ids extra to it.
 * @param {string} surface
 * @param {Set<string>} truth
 * @param {Set<string>} actual
 * @returns {string[]} findings
 */
function surfaceDiffFindings(surface, truth, actual) {
  const missing = [...truth].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !truth.has(id));
  const findings = [];
  if (missing.length > 0) findings.push(`${surface}: missing ${missing.join(', ')}`);
  if (extra.length > 0) findings.push(`${surface}: extra ${extra.join(', ')}`);
  return findings;
}

/**
 * Sub-guard 2: the enabled phase-id set derived from pipeline/default.yml must match
 * both the README mermaid diagram and the README timeline block, order-insensitive.
 * @param {string} root
 * @param {{mermaidPhases: string[], timelinePhases: string[]}} regions
 * @returns {string[]} findings
 */
function phaseNameFindings(root, regions) {
  const descriptors = load(readFileSync(join(root, 'pipeline/default.yml'), 'utf8'));
  const truth = new Set(enabledPhaseIds(descriptors));
  return [
    ...surfaceDiffFindings('phase-names:mermaid', truth, new Set(regions.mermaidPhases)),
    ...surfaceDiffFindings('phase-names:timeline', truth, new Set(regions.timelinePhases)),
  ];
}

/**
 * Sub-guard 3: the README FAQ cost sentence must match the aggregates recomputed
 * from the telemetry report.
 * @param {string} root
 * @param {{runCount: string, median: string, min: string, max: string}} costClaims
 * @returns {string[]} findings
 */
function telemetryFindings(root, costClaims) {
  const report = JSON.parse(readFileSync(join(root, 'docs/metrics-baseline.report.json'), 'utf8'));
  return compareClaims(recomputeClaims(report), costClaims);
}

/**
 * @param {string[]} findings
 * @param {{ stdout: { write(s: string): void } }} io
 */
function printFindings(findings, io) {
  for (const finding of findings) io.stdout.write(`readme-drift: ${finding}\n`);
}

/**
 * Run one sub-guard, converting any thrown input failure (unreadable file,
 * malformed YAML/JSON, degenerate report) into a printed finding on the named
 * surface — the guard stays fail-closed without leaking a stack trace.
 * @param {string} surface
 * @param {() => string[]} subGuard
 * @returns {string[]} findings
 */
function guarded(surface, subGuard) {
  try {
    return subGuard();
  } catch (err) {
    return [`${surface}: unusable input: ${err.message}`];
  }
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code — 0 clean, 1 drift/error
 */
export function main(argv, io) {
  const root = argv[0] ? resolve(argv[0]) : DEFAULT_ROOT;

  let regions;
  try {
    regions = extractReadmeRegions(readFileSync(join(root, 'README.md'), 'utf8'));
  } catch (err) {
    printFindings([`readme: unusable input: ${err.message}`], io);
    return EXIT_DRIFT;
  }

  const findings = [
    ...guarded('manifest-snippet', () => manifestSnippetFindings(regions.yamlBlocks)),
    ...guarded('phase-names', () => phaseNameFindings(root, regions)),
    ...guarded('telemetry', () => telemetryFindings(root, regions.costClaims)),
  ];

  printFindings(findings, io);
  return findings.length === 0 ? EXIT_CLEAN : EXIT_DRIFT;
}
