/**
 * `adr-lint` — the whole-corpus C0–C3 gate over ADR supersession declarations.
 * A near-copy of `plan-lint`/`intention-lint`'s bin-shim-over-pure-src shape,
 * hard-blocking, no `hygiene.gate` knob (a superseded decision left
 * un-propagated is a correctness fact, not a style smell).
 *
 * C0 — declaration form: a *present* frontmatter fence's `subjects` must be a
 *   list of non-empty strings and each `supersedes` entry must be
 *   `{ adr: <string>, scope: <non-empty string> }`. A missing fence is never a
 *   finding — that is what keeps every legacy ADR green structurally.
 * C1 — target status flip: the file `<adr-dir>` resolves the `adr` id's
 *   filename prefix to must carry `- **Status:** superseded by ADR-<M>`.
 * C2 — scope stated in both directions: *M*'s body carries line-anchored
 *   `Superseded from ADR-N` and `Carried forward from ADR-N` prefixes.
 * C3 — live-tier citation sweep: one tracked-tree `git grep` pass for every
 *   superseded id, minus the exempt set derived from the manifest's
 *   `paths.adr`/`paths.design`/`paths.plan` (or `adr.frozen` when present).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { extractFrontmatter, parseManifestContent } from './frontmatter.js';
import { collectWaived, escapeRegExp } from './hygiene-lint-core.js';
import { matchGlob } from './glob.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const DEFAULT_MANIFEST_PATH = '.claude/workflow.md';
const USAGE = 'adr-lint: usage: adr-lint <adr-dir> [--manifest <path>] [--waiver-source <file>]...\n';
const WAIVER_PATTERN = /DECISION-CITE-WAIVE\(([^)]+)\)/g;
const CITE_TOKEN = 'DECISION-CITE-FOUND';
const HIT_LINE_PATTERN = /^(.+?):(\d+):(.*)$/;

/**
 * Never-throw directory predicate mirroring the sibling lint mains' own copy.
 * @param {string} p
 * @returns {boolean}
 */
function isDirectoryPath(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string[]} argv
 * @returns {{ adrDir: string|undefined, manifestPath: string|undefined, waiverSources: string[] }}
 */
function parseArgv(argv) {
  let adrDir;
  let manifestPath;
  const waiverSources = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') {
      if (i + 1 >= argv.length) continue;
      manifestPath = argv[i + 1];
      i += 1;
    } else if (arg === '--waiver-source') {
      if (i + 1 >= argv.length) continue;
      waiverSources.push(argv[i + 1]);
      i += 1;
    } else if (adrDir === undefined) {
      adrDir = arg;
    }
  }
  return { adrDir, manifestPath, waiverSources };
}

/**
 * Absent/unreadable manifest is the zero-config case — silent. A present but
 * malformed manifest degrades to no-config with a loud stderr line, never a
 * crash — mirrors `hygiene-gate-main.js`'s `resolveGate`.
 * @param {string} manifestPath
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {object|null}
 */
function readManifest(manifestPath, io) {
  let content;
  try {
    content = readFileSync(manifestPath, 'utf8');
  } catch {
    return null;
  }
  try {
    return parseManifestContent(content);
  } catch (e) {
    io.stderr.write(`adr-lint: cannot parse ${manifestPath}: ${e.message}\n`);
    return null;
  }
}

/**
 * @param {string} adrDirAbs
 * @returns {Array<{ fileName: string, filePath: string, content: string, id: string|null }>}
 */
function readAdrFiles(adrDirAbs) {
  return readdirSync(adrDirAbs)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((fileName) => {
      const filePath = join(adrDirAbs, fileName);
      const content = readFileSync(filePath, 'utf8');
      const idMatch = fileName.match(/^(\d+)-/);
      return { fileName, filePath, content, id: idMatch ? idMatch[1] : null };
    });
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyStringListForm(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

/**
 * The `adr` id is the zero-padded 3-digit string exactly as it appears in the
 * filename and in `ADR-NNN` prose — never a number, never reformatted.
 * @param {unknown} entry
 * @returns {boolean}
 */
function isValidSupersedesEntry(entry) {
  return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.adr === 'string' && entry.adr.length > 0
    && typeof entry.scope === 'string' && entry.scope.trim().length > 0;
}

/**
 * C0 — form only, over a parsed frontmatter declaration.
 * @param {string} filePath
 * @param {Record<string, unknown>} declaration
 * @returns {string[]}
 */
function checkC0Form(filePath, declaration) {
  const findings = [];
  if (Object.hasOwn(declaration, 'subjects') && !isNonEmptyStringListForm(declaration.subjects)) {
    findings.push(`${filePath}: subjects must be a list of non-empty strings`);
  }
  if (Object.hasOwn(declaration, 'supersedes')) {
    if (!Array.isArray(declaration.supersedes)) {
      findings.push(`${filePath}: supersedes must be a list`);
    } else {
      declaration.supersedes.forEach((entry, idx) => {
        if (!isValidSupersedesEntry(entry)) {
          findings.push(`${filePath}: supersedes[${idx}] must be { adr: <string>, scope: <non-empty string> }`);
        }
      });
    }
  }
  return findings;
}

/**
 * Parse one ADR's frontmatter declaration. A missing fence is never a
 * finding; malformed YAML in a present fence is.
 * @param {{ filePath: string, content: string }} file
 * @returns {{ declaration: Record<string, unknown>|null, c0Findings: string[] }}
 */
function parseDeclaration(file) {
  const fence = extractFrontmatter(file.content);
  if (fence === null) return { declaration: null, c0Findings: [] };

  let parsed;
  try {
    parsed = load(fence);
  } catch (e) {
    return { declaration: null, c0Findings: [`${file.filePath}: malformed frontmatter YAML — ${e.message}`] };
  }

  const declaration = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return { declaration, c0Findings: checkC0Form(file.filePath, declaration) };
}

/**
 * C1 — the target file (resolved by filename prefix) must carry the status
 * flip line. Zero or two+ matches is a finding, never a crash.
 * @param {object} record - the superseding ADR M's record
 * @param {{ adr: string, scope: string }} entry
 * @param {object[]} allRecords
 * @returns {string[]}
 */
function checkC1(record, entry, allRecords) {
  const targets = allRecords.filter((r) => r.fileName.startsWith(`${entry.adr}-`));
  if (targets.length !== 1) {
    return [
      `${record.filePath}: supersedes ADR-${entry.adr} but the target file could not be uniquely resolved (${targets.length} match(es))`,
    ];
  }
  const [target] = targets;
  const expectedLine = `- **Status:** superseded by ADR-${record.id}`;
  const hasLine = target.content.split('\n').some((line) => line.trim() === expectedLine);
  return hasLine ? [] : [`${target.filePath}: missing required line: ${expectedLine}`];
}

/**
 * C2 — both direction anchors, line-anchored prefixes naming the target id.
 * @param {object} record - the superseding ADR M's record
 * @param {{ adr: string, scope: string }} entry
 * @returns {string[]}
 */
function checkC2(record, entry) {
  const n = escapeRegExp(entry.adr);
  const findings = [];
  if (!new RegExp(`^Superseded from ADR-${n}\\b`, 'm').test(record.content)) {
    findings.push(`${record.filePath}: missing a line starting "Superseded from ADR-${entry.adr}"`);
  }
  if (!new RegExp(`^Carried forward from ADR-${n}\\b`, 'm').test(record.content)) {
    findings.push(`${record.filePath}: missing a line starting "Carried forward from ADR-${entry.adr}"`);
  }
  return findings;
}

/**
 * Walk up from startDir to the nearest ancestor carrying a `.git` entry
 * (file or directory — a worktree's `.git` is a file), falling back to
 * startDir when none is found.
 * @param {string} startDir
 * @returns {string}
 */
function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

/**
 * @param {string} repoRoot
 * @param {string} pattern
 * @returns {string} git grep stdout
 */
function defaultRunGitGrep(repoRoot, pattern) {
  return execFileSync('git', ['-C', repoRoot, 'grep', '-n', '-E', pattern], { encoding: 'utf8' });
}

/**
 * @param {string} v
 * @returns {boolean}
 */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function joinRel(parentRel, child) {
  return parentRel === '' ? child : `${parentRel}/${child}`;
}

function parentSegments(relPath) {
  return relPath.split('/').slice(0, -1);
}

/**
 * The common directory parent of a set of repo-relative directory paths.
 * @param {string[]} relPaths
 * @returns {string}
 */
function commonParentRel(relPaths) {
  const segLists = relPaths.map(parentSegments);
  const minLen = Math.min(...segLists.map((s) => s.length));
  const common = [];
  for (let i = 0; i < minLen; i += 1) {
    const seg = segLists[0][i];
    if (segLists.every((s) => s[i] === seg)) common.push(seg);
    else break;
  }
  return common.join('/');
}

/**
 * The C3 exempt set — derived from resolved manifest paths, or `adr.frozen`
 * globs when present (which *replace* the derived set — an empty list is a
 * deliberate "nothing else is exempt", never an omission). `<adr-dir>` stays
 * exempt unconditionally in both branches — no separate self-flagging rule.
 * @param {string} adrDirRel
 * @param {object|null} manifest
 * @returns {{ mode: 'frozen', globs: string[], adrDirRel: string }|{ mode: 'derived', dirs: string[] }}
 */
function resolveExemptSet(adrDirRel, manifest) {
  const frozen = manifest?.adr?.frozen;
  if (Array.isArray(frozen)) {
    return { mode: 'frozen', globs: frozen, adrDirRel };
  }

  const adrPathRel = isNonEmptyString(manifest?.paths?.adr) ? manifest.paths.adr : adrDirRel;
  const designRel = isNonEmptyString(manifest?.paths?.design) ? manifest.paths.design : null;
  const planRel = isNonEmptyString(manifest?.paths?.plan) ? manifest.paths.plan : null;
  const declared = [adrPathRel, designRel, planRel].filter(isNonEmptyString);
  const parent = commonParentRel(declared);
  const dirs = new Set([...declared, joinRel(parent, 'archive'), joinRel(parent, 'prd'), adrDirRel]);
  return { mode: 'derived', dirs: [...dirs] };
}

function isUnderDirRel(relPath, dirRel) {
  return relPath === dirRel || relPath.startsWith(`${dirRel}/`);
}

function isExempt(relPath, exempt) {
  if (exempt.mode === 'frozen') {
    return isUnderDirRel(relPath, exempt.adrDirRel) || exempt.globs.some((g) => matchGlob(relPath, g));
  }
  return exempt.dirs.some((dir) => isUnderDirRel(relPath, dir));
}

/**
 * @param {object[]} declaringRecords
 * @returns {Set<string>}
 */
function collectTargets(declaringRecords) {
  const targets = new Set();
  for (const record of declaringRecords) {
    for (const entry of record.declaration.supersedes) {
      if (isValidSupersedesEntry(entry)) targets.add(entry.adr);
    }
  }
  return targets;
}

/**
 * C3 — one tracked-tree `git grep` pass for every superseded id, minus the
 * exempt set. Zero targets skips the process entirely. A tree with no git,
 * or a `git grep` that genuinely fails, is a recorded stderr skip, not a
 * crash — `git grep` exiting 1 (no matches) is success, distinguished from a
 * real invocation error.
 * @param {object[]} declaringRecords
 * @param {string} adrDirAbs
 * @param {object|null} manifest
 * @param {Set<string>} waived
 * @param {{ stderr: { write(s: string): void } }} io
 * @param {(repoRoot: string, pattern: string) => string} runGitGrep
 * @returns {string[]}
 */
function runC3(declaringRecords, adrDirAbs, manifest, waived, io, runGitGrep) {
  const targets = collectTargets(declaringRecords);
  if (targets.size === 0) return [];

  const escaped = [...targets].map(escapeRegExp);
  // No \b: git grep -E is POSIX extended regex, which does not treat \b as a
  // word-boundary token on every platform (it silently fails to match at all
  // on macOS's system regex engine) — the alternation itself is unambiguous
  // enough for this corpus's fixed 3-digit ids.
  const pattern = `ADR-(${escaped.join('|')})`;
  const repoRoot = findRepoRoot(adrDirAbs);

  let output;
  try {
    output = runGitGrep(repoRoot, pattern);
  } catch (e) {
    if (e.status === 1) {
      output = ''; // git grep exit 1: no matches — success, not failure
    } else {
      io.stderr.write(`adr-lint: citation sweep skipped (no git, or git grep failed) — ${e.message}\n`);
      return [];
    }
  }

  const adrDirRel = relative(repoRoot, adrDirAbs);
  const exempt = resolveExemptSet(adrDirRel, manifest);
  const hitPattern = new RegExp(`ADR-(${escaped.join('|')})`, 'g');

  const findings = [];
  for (const line of output.split('\n')) {
    if (line === '') continue;
    const match = line.match(HIT_LINE_PATTERN);
    if (!match) continue;
    const [, relPath, lineNo, content] = match;
    if (isExempt(relPath, exempt)) continue;
    if (waived.has(resolve(repoRoot, relPath))) continue;
    for (const hit of content.matchAll(hitPattern)) {
      findings.push(`${CITE_TOKEN}(${relPath}): ADR-${hit[1]}@L${lineNo}`);
    }
  }
  return findings;
}

/**
 * Main entrypoint for adr-lint logic.
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ runGitGrep?: (repoRoot: string, pattern: string) => string }} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const runGitGrep = deps.runGitGrep ?? defaultRunGitGrep;
  const { adrDir, manifestPath, waiverSources } = parseArgv(argv);

  if (!adrDir || !isDirectoryPath(adrDir)) {
    io.stderr.write(USAGE);
    return EXIT_INVALID;
  }

  const manifest = readManifest(manifestPath ?? DEFAULT_MANIFEST_PATH, io);
  const { waived } = collectWaived(waiverSources, io, WAIVER_PATTERN);

  const adrDirAbs = resolve(adrDir);
  const records = readAdrFiles(adrDirAbs).map((file) => ({ ...file, ...parseDeclaration(file) }));

  const findings = [];
  for (const record of records) findings.push(...record.c0Findings);

  const declaring = records.filter(
    (r) => r.declaration && Array.isArray(r.declaration.supersedes) && r.declaration.supersedes.length > 0,
  );
  for (const record of declaring) {
    for (const entry of record.declaration.supersedes) {
      if (!isValidSupersedesEntry(entry)) continue;
      findings.push(...checkC1(record, entry, records));
      findings.push(...checkC2(record, entry));
    }
  }

  findings.push(...runC3(declaring, adrDirAbs, manifest, waived, io, runGitGrep));

  if (findings.length > 0) {
    for (const finding of findings) io.stdout.write(`${finding}\n`);
    return EXIT_INVALID;
  }

  io.stdout.write(`craft-adr: OK — ${records.length} ADR(s) checked, ${declaring.length} declaring supersession.\n`);
  return EXIT_OK;
}
