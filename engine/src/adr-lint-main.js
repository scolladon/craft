/**
 * `adr-lint` — the whole-corpus C0–C3 gate over ADR supersession declarations.
 * A near-copy of `plan-lint`/`intention-lint`'s bin-shim-over-pure-src shape,
 * hard-blocking, no `hygiene.gate` knob (a superseded decision left
 * un-propagated is a correctness fact, not a style smell).
 *
 * C0 — declaration form: a *present* frontmatter fence's `subjects` must be a
 *   list of non-empty strings and each `supersedes` entry must be
 *   `{ adr: <3-digit id>, scope: <non-empty string> }`. A missing fence is
 *   never a finding — that is what keeps every legacy ADR green structurally.
 * C1 — target status flip: the file `<adr-dir>` resolves the `adr` id's
 *   filename prefix to must carry `- **Status:** superseded by ADR-<M>`.
 * C2 — scope stated in both directions: *M*'s body carries line-anchored
 *   `Superseded from ADR-N` and `Carried forward from ADR-N` prefixes.
 * C3 — live-tier citation sweep: one tracked-tree `git grep` pass for every
 *   superseded id, minus the exempt set derived from the manifest's
 *   `paths.adr`/`paths.design`/`paths.plan` (or `adr.frozen` when present).
 *
 * Every path this module reports is repo-relative: absolute paths in gate
 * output are machine-specific and leak the operator's home directory.
 */

import { readdirSync, statSync, existsSync, lstatSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { load } from 'js-yaml';
import { extractFrontmatter, parseManifestContent } from './frontmatter.js';
import { collectWaived, escapeRegExp, readWithinCap, MAX_FILE_BYTES } from './hygiene-lint-core.js';
import { containByRealpath } from './contain.js';
import { matchGlob, matchesEveryPath } from './glob.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const DEFAULT_MANIFEST_REL = '.claude/workflow.md';
const USAGE = 'adr-lint: usage: adr-lint <adr-dir> [--manifest <path>] [--waiver-source <file>]...\n';
const WAIVER_PATTERN = /DECISION-CITE-WAIVE\(([^)]+)\)/g;
const CITE_TOKEN = 'DECISION-CITE-FOUND';

/** C0 controls + DEL: a tracked filename may carry them; gate output must not. */
const CONTROL_CHARS_GLOBAL = /[\u0000-\u001f\u007f]/g;

/** A line break inside a pathname makes a git grep record unattributable. */
const LINE_BREAK = /[\n\r]/;

/**
 * Every interpolated path or glob is attacker-controlled when linting an
 * untrusted clone. Republishing raw bytes to stdout is a terminal-spoofing
 * primitive against whoever reads the CI log.
 * @param {string} value
 * @returns {string}
 */
function safeLabel(value) {
  return String(value).replace(CONTROL_CHARS_GLOBAL, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

/**
 * The engine's zero-config path contract, mirroring the probes the phase
 * skills document (`paths.design`, else `docs/design/`; `paths.plan`, else
 * `docs/plan/`). These are the ENGINE defaults, deliberately not craft's own
 * `docs/contributing/*` layout — a consumer on defaults must get the same
 * frozen tiers a consumer with a manifest gets, or the gate wedges its CI.
 */
const DEFAULT_PATHS = Object.freeze({ design: 'docs/design', plan: 'docs/plan' });

/** git grep output can be large on a wide corpus; 1 MiB (Node's default) is not enough. */
const GIT_GREP_MAX_BUFFER = 64 * 1024 * 1024;

/** The `adr` id is the zero-padded 3-digit string as it appears in filenames and `ADR-NNN` prose. */
const ADR_ID_PATTERN = /^\d{3}$/;

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
 * @param {string} p
 * @returns {boolean}
 */
function isRegularFile(p) {
  try {
    return lstatSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Strict argv parse: a flag missing its value, or a surplus positional, is a
 * usage error rather than a silent degradation at a boundary.
 * @param {string[]} argv
 * @returns {{ adrDir?: string, manifestPath?: string, waiverSources: string[], error?: string }}
 */
function parseArgv(argv) {
  let adrDir;
  let manifestPath;
  const waiverSources = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest' || arg === '--waiver-source') {
      if (i + 1 >= argv.length) return { waiverSources, error: `${arg} requires a value` };
      if (arg === '--manifest') manifestPath = argv[i + 1];
      else waiverSources.push(argv[i + 1]);
      i += 1;
    } else if (adrDir === undefined) {
      adrDir = arg;
    } else {
      return { waiverSources, error: `unexpected argument: ${arg}` };
    }
  }
  return { adrDir, manifestPath, waiverSources };
}

/**
 * js-yaml quotes the offending source lines into its message; a lint that
 * echoed those to CI stdout would republish content it merely parsed.
 * @param {string} message
 * @returns {string}
 */
function firstLine(message) {
  return String(message).split('\n')[0];
}

/**
 * Absent/unreadable manifest is the zero-config case — silent. A present but
 * malformed manifest degrades to no-config with a loud stderr line, never a
 * crash — mirrors `hygiene-gate-main.js`'s `resolveGate`.
 * @param {string} manifestPath
 * @param {string} repoRoot
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {object|null}
 */
function readManifest(manifestPath, repoRoot, explicit, io) {
  const relPath = safeLabel(relative(repoRoot, manifestPath) || manifestPath);
  // A manifest that is simply absent at the default location is the zero-config
  // case and stays silent. Anything else — present but unreadable, oversize,
  // escaping the root, unparsable, or an explicit --manifest that misses — is a
  // FINDING. Dropping it to `null` would let an attacker-controlled read
  // failure select the DERIVED exempt set, which is wider than a manifest that
  // scopes its own frozen tier: a read failure must never widen a gate.
  if (!existsSync(manifestPath)) {
    return explicit
      ? { manifest: null, findings: [`${relPath}: --manifest names a file that does not exist`] }
      : { manifest: null, findings: [] };
  }
  if (containByRealpath(repoRoot, manifestPath) === null) {
    return { manifest: null, findings: [`${relPath}: refusing to read the manifest — symlink or a path escaping the repository root`] };
  }
  const { content, readError } = readWithinCap(manifestPath, io, MAX_FILE_BYTES, `manifest ${relPath}`);
  if (readError || content === undefined) {
    return { manifest: null, findings: [`${relPath}: manifest unreadable, or larger than the ${MAX_FILE_BYTES}-byte cap`] };
  }
  try {
    return { manifest: parseManifestContent(content), findings: [] };
  } catch (e) {
    return { manifest: null, findings: [`${relPath}: cannot parse the manifest — ${safeLabel(firstLine(e.message))}`] };
  }
}

/**
 * Read the ADR corpus. A committed symlink must never redirect a read out of
 * the tree, and an unreadable or oversize entry is a finding rather than an
 * uncaught throw out of a lint whose whole posture is "a finding, not a crash".
 * @param {string} adrDirAbs
 * @param {string} repoRoot
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {{ files: object[], findings: string[] }}
 */
function readAdrFiles(adrDirAbs, repoRoot, io) {
  const files = [];
  const findings = [];
  let entries;
  try {
    entries = readdirSync(adrDirAbs);
  } catch (e) {
    return { files, findings: [`${safeLabel(relative(repoRoot, adrDirAbs))}: unreadable ADR directory — ${firstLine(e.message)}`] };
  }
  for (const fileName of entries.filter((f) => f.endsWith('.md')).sort()) {
    const filePath = join(adrDirAbs, fileName);
    const relPath = relative(repoRoot, filePath);
    if (containByRealpath(repoRoot, filePath) === null || !isRegularFile(filePath)) {
      findings.push(`${relPath}: refusing to read — not a regular file inside the repository root`);
      continue;
    }
    const { content, readError } = readWithinCap(filePath, io, MAX_FILE_BYTES, relPath);
    if (readError || content === undefined) {
      findings.push(`${relPath}: unreadable, or larger than the ${MAX_FILE_BYTES}-byte cap`);
      continue;
    }
    const idMatch = fileName.match(/^(\d+)-/);
    files.push({ fileName, filePath, relPath, content, id: idMatch ? idMatch[1] : null });
  }
  return { files, findings };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyStringListForm(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

/**
 * The `adr` id is constrained at the boundary rather than escaped downstream:
 * it reaches a `git grep -E` pattern, where a newline would be read as a
 * pattern separator and an unbalanced fragment makes git exit 128.
 * @param {unknown} entry
 * @returns {boolean}
 */
function isValidSupersedesEntry(entry) {
  return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry.adr === 'string' && ADR_ID_PATTERN.test(entry.adr)
    && typeof entry.scope === 'string' && entry.scope.trim().length > 0;
}

/**
 * C0 — form only, over a parsed frontmatter declaration.
 * @param {string} relPath
 * @param {Record<string, unknown>} declaration
 * @returns {string[]}
 */
function checkC0Form(relPath, declaration) {
  const findings = [];
  if (Object.hasOwn(declaration, 'subjects') && !isNonEmptyStringListForm(declaration.subjects)) {
    findings.push(`${relPath}: subjects must be a list of non-empty strings`);
  }
  if (!Object.hasOwn(declaration, 'supersedes')) return findings;
  if (!Array.isArray(declaration.supersedes)) {
    findings.push(`${relPath}: supersedes must be a list`);
    return findings;
  }
  declaration.supersedes.forEach((entry, idx) => {
    if (!isValidSupersedesEntry(entry)) {
      findings.push(`${relPath}: supersedes[${idx}] must be { adr: <3-digit id>, scope: <non-empty string> }`);
    }
  });
  return findings;
}

/**
 * Parse one ADR's frontmatter declaration. A missing fence is never a
 * finding; malformed YAML in a present fence is.
 * @param {{ relPath: string, content: string }} file
 * @returns {{ declaration: Record<string, unknown>|null, c0Findings: string[] }}
 */
function parseDeclaration(file) {
  const fence = extractFrontmatter(file.content);
  if (fence === null) return { declaration: null, c0Findings: [] };

  let parsed;
  try {
    parsed = load(fence);
  } catch (e) {
    return { declaration: null, c0Findings: [`${file.relPath}: malformed frontmatter YAML — ${firstLine(e.message)}`] };
  }

  const declaration = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return { declaration, c0Findings: checkC0Form(file.relPath, declaration) };
}

/**
 * C1 — the target file (resolved by filename prefix) must carry the status
 * flip line naming THIS superseder. Zero or two+ matches is a finding.
 * @param {object} record - the superseding ADR M's record
 * @param {{ adr: string }} entry
 * @param {object[]} allRecords
 * @returns {string[]}
 */
function checkC1(record, entry, allRecords) {
  const targets = allRecords.filter((r) => r.fileName.startsWith(`${entry.adr}-`));
  if (targets.length !== 1) {
    return [
      `${record.relPath}: supersedes ADR-${entry.adr} but the target file could not be uniquely resolved (${targets.length} match(es))`,
    ];
  }
  const [target] = targets;
  const expectedLine = `- **Status:** superseded by ADR-${record.id}`;
  const hasLine = target.content.split('\n').some((line) => line.trim() === expectedLine);
  return hasLine ? [] : [`${target.relPath}: missing required line: ${expectedLine}`];
}

/**
 * C2 — both direction anchors, line-anchored prefixes naming the target id.
 * @param {object} record - the superseding ADR M's record
 * @param {{ adr: string }} entry
 * @returns {string[]}
 */
function checkC2(record, entry) {
  const n = escapeRegExp(entry.adr);
  const findings = [];
  if (!new RegExp(`^Superseded from ADR-${n}\\b`, 'm').test(record.content)) {
    findings.push(`${record.relPath}: missing a line starting "Superseded from ADR-${entry.adr}"`);
  }
  if (!new RegExp(`^Carried forward from ADR-${n}\\b`, 'm').test(record.content)) {
    findings.push(`${record.relPath}: missing a line starting "Carried forward from ADR-${entry.adr}"`);
  }
  return findings;
}

/**
 * C1 + C2 over every valid declaration.
 * @param {object[]} declaringRecords
 * @param {object[]} allRecords
 * @returns {string[]}
 */
function checkSupersessionEntries(declaringRecords, allRecords) {
  const findings = [];
  for (const record of declaringRecords) {
    for (const entry of record.declaration.supersedes) {
      if (!isValidSupersedesEntry(entry)) continue;
      findings.push(...checkC1(record, entry, allRecords), ...checkC2(record, entry));
    }
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
 * `-z` NUL-terminates the pathname AND the line number, so a filename
 * containing a colon or a newline can never be mis-split; `--text` stops a
 * file git considers binary from being reported as an unsearched
 * `Binary file X matches` line that silently leaves the gate blind.
 * @param {string} repoRoot
 * @param {string} pattern
 * @returns {string} git grep stdout
 */
function defaultRunGitGrep(repoRoot, pattern) {
  return execFileSync('git', ['-C', repoRoot, 'grep', '-z', '-n', '--text', '-E', pattern], {
    encoding: 'utf8',
    maxBuffer: GIT_GREP_MAX_BUFFER,
  });
}

/**
 * The only failures that may downgrade the sweep to a recorded skip: no git
 * binary at all, and a tree that is not a repository. Every other failure —
 * a buffer overrun, a fatal pattern error — must fail the gate, because a
 * blocking correctness gate with a silent pass path is not a gate.
 * @param {Error & { code?: string, status?: number, stderr?: unknown }} e
 * @returns {boolean}
 */
function isEnvironmentalGitFailure(e) {
  if (e.code === 'ENOENT') return true;
  return e.status === 128 && /not a git repository/i.test(String(e.stderr ?? ''));
}

/**
 * Parse `git grep -z -n` output: repeating `path\0lineno\0content\n`.
 * Anything not matching that shape is counted and surfaced, never dropped —
 * a silently-skipped output record is indistinguishable from a clean sweep.
 * @param {string} output
 * @returns {{ hits: Array<{ relPath: string, lineNo: string, content: string }>, unparsed: number }}
 */
function parseGitGrepRecords(output) {
  const hits = [];
  let unparsed = 0;
  let cursor = 0;
  while (cursor < output.length) {
    // Anchor FORWARD on the two NUL delimiters before looking for the record
    // terminator. Deriving the terminator from the first '\n' would find a
    // newline *inside the pathname* first, re-opening the mis-split the NUL
    // format exists to close — and a path whose first byte is '\n' would
    // re-parse as an attacker-chosen suffix under an exempt prefix.
    const pathEnd = output.indexOf('\0', cursor);
    const lineNoEnd = pathEnd === -1 ? -1 : output.indexOf('\0', pathEnd + 1);
    if (pathEnd === -1 || lineNoEnd === -1) {
      unparsed += 1; // desynchronised tail — never re-scan it looking for a shape
      break;
    }
    const lineEnd = output.indexOf('\n', lineNoEnd + 1);
    const recordEnd = lineEnd === -1 ? output.length : lineEnd;
    const relPath = output.slice(cursor, pathEnd);
    if (LINE_BREAK.test(relPath)) {
      // A line break inside the pathname makes the record ambiguous: it is
      // indistinguishable from an unparseable line followed by a real record.
      // Resyncing at the break would let a path chosen as `\n<exempt-prefix>/x`
      // read as exempt and vanish, so the record is refused outright. The count
      // is itself a blocking finding, so nothing is hidden by refusing it.
      unparsed += 1;
    } else {
      hits.push({
        relPath,
        lineNo: output.slice(pathEnd + 1, lineNoEnd),
        content: output.slice(lineNoEnd + 1, recordEnd),
      });
    }
    cursor = recordEnd + 1;
  }
  return { hits, unparsed };
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
 * Never called with an empty list: the design and plan entries always resolve,
 * to `DEFAULT_PATHS` when the manifest declares none.
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
 * @returns {{ mode: string, globs?: string[], dirs?: string[], adrDirRel: string }}
 */
function resolveExemptSet(adrDirRel, manifest) {
  const frozen = manifest?.adr?.frozen;
  if (Array.isArray(frozen)) {
    // Enforced here, not only at manifest validation: adr-lint parses the
    // manifest directly and ci.sh never runs manifest-lint over it, so a
    // validator-only rule would leave the off-switch fully open.
    const universal = frozen.filter((g) => typeof g === 'string' && matchesEveryPath(g));
    return { mode: 'frozen', globs: frozen, adrDirRel, universal };
  }

  const adrPathRel = isNonEmptyString(manifest?.paths?.adr) ? manifest.paths.adr : adrDirRel;
  const designRel = isNonEmptyString(manifest?.paths?.design) ? manifest.paths.design : DEFAULT_PATHS.design;
  const planRel = isNonEmptyString(manifest?.paths?.plan) ? manifest.paths.plan : DEFAULT_PATHS.plan;
  const declared = [adrPathRel, designRel, planRel].filter(isNonEmptyString);
  const parent = commonParentRel(declared);
  const dirs = new Set([...declared, joinRel(parent, 'archive'), joinRel(parent, 'prd')]);
  return { mode: 'derived', dirs: [...dirs], adrDirRel };
}

/**
 * An empty `dirRel` is the repository root — everything is under it.
 * @param {string} relPath
 * @param {string} dirRel
 * @returns {boolean}
 */
function isUnderDirRel(relPath, dirRel) {
  if (dirRel === '') return true;
  return relPath === dirRel || relPath.startsWith(`${dirRel}/`);
}

/**
 * `<adr-dir>` is exempt before either branch is consulted, so no `adr.frozen`
 * can resurrect self-flagging on the anchors C2 just required.
 * @param {string} relPath
 * @param {object} exempt
 * @returns {boolean}
 */
function isExempt(relPath, exempt) {
  if (isUnderDirRel(relPath, exempt.adrDirRel)) return true;
  if (exempt.mode === 'frozen') return exempt.globs.some((g) => matchGlob(relPath, g));
  return exempt.dirs.some((dir) => isUnderDirRel(relPath, dir));
}

/**
 * The exempt set decides whether a citation is reported at all, so a run must
 * never leave it implicit — an over-broad `adr.frozen` would otherwise be a
 * silent off-switch on a gate that deliberately has no advisory knob.
 * @param {object} exempt
 * @param {{ stderr: { write(s: string): void } }} io
 */
function announceExemptSet(exempt, io) {
  const listed = exempt.mode === 'frozen' ? exempt.globs : exempt.dirs;
  const adrDirShown = exempt.adrDirRel === '' ? '(repository root)' : exempt.adrDirRel;
  const shown = [...new Set([adrDirShown, ...listed])].map(safeLabel);
  io.stderr.write(`adr-lint: citation sweep exempts (${exempt.mode}): ${shown.join(', ')}\n`);
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
 * exempt set. Zero targets skips the process entirely.
 * @param {object} ctx
 * @returns {string[]}
 */
function runC3(ctx) {
  const targets = collectTargets(ctx.declaring);
  if (targets.size === 0) return [];

  const escaped = [...targets].map(escapeRegExp);
  // No \b: git grep -E is POSIX extended regex, which does not treat \b as a
  // word-boundary token on every platform (it silently fails to match at all
  // on macOS's system regex engine) — the ids are boundary-constrained to
  // exactly three digits at the form check instead.
  const pattern = `ADR-(${escaped.join('|')})`;

  let output;
  try {
    output = ctx.runGitGrep(ctx.repoRoot, pattern);
  } catch (e) {
    if (e.status === 1) {
      output = ''; // git grep exit 1: no matches — success, not failure
    } else if (isEnvironmentalGitFailure(e)) {
      ctx.io.stderr.write(`adr-lint: citation sweep skipped (no git repository) — ${firstLine(e.message)}\n`);
      return [];
    } else {
      return [`citation sweep failed, so the tree is unswept — ${firstLine(e.message)}`];
    }
  }

  const exempt = resolveExemptSet(ctx.adrDirRel, ctx.manifest);
  announceExemptSet(exempt, ctx.io);
  return sweepHits(output, exempt, escaped, ctx);
}

/**
 * @param {string} output
 * @param {object} exempt
 * @param {string[]} escaped
 * @param {{ repoRoot: string, waived: Set<string> }} ctx
 * @returns {string[]}
 */
function sweepHits(output, exempt, escaped, ctx) {
  const hitPattern = new RegExp(`ADR-(${escaped.join('|')})`, 'g');
  const { hits, unparsed } = parseGitGrepRecords(output);
  const findings = [];
  for (const glob of exempt.universal ?? []) {
    findings.push(`adr.frozen entry '${safeLabel(glob)}' exempts the whole tree, which disables the citation sweep`);
  }
  if (unparsed > 0) {
    findings.push(`citation sweep produced ${unparsed} unreadable output record(s), so it is not a pass claim`);
  }
  for (const { relPath, lineNo, content } of hits) {
    if (isExempt(relPath, exempt)) continue;
    if (ctx.waived.has(resolve(ctx.repoRoot, relPath))) continue;
    for (const hit of content.matchAll(hitPattern)) {
      findings.push(`${CITE_TOKEN}(${safeLabel(relPath)}): ADR-${hit[1]}@L${lineNo}`);
    }
  }
  return findings;
}

/**
 * Every base — manifest, waivers, reported paths, the sweep — is the repo root
 * the ADR directory lives in. Keying any of them off `process.cwd()` would
 * apply a foreign repo's manifest when linting from another tree.
 * @param {{ adrDir: string, manifestPath?: string, waiverSources: string[] }} args
 * @param {object} io
 * @returns {object}
 */
function resolveRunContext(args, io) {
  const adrDirAbs = resolve(args.adrDir);
  const repoRoot = findRepoRoot(adrDirAbs);
  const explicitManifest = args.manifestPath !== undefined;
  const manifestPath = explicitManifest ? resolve(repoRoot, args.manifestPath) : join(repoRoot, DEFAULT_MANIFEST_REL);
  const { manifest, findings: manifestFindings } = readManifest(manifestPath, repoRoot, explicitManifest, io);
  // Waiver SOURCES resolve against the repo root, exactly like the waived paths
  // their contents name — otherwise the two disagree whenever the lint is
  // invoked from anywhere but the root and a waiver quietly stops applying.
  const sources = args.waiverSources.map((source) => resolve(repoRoot, source));
  const { waived } = collectWaived(sources, io, WAIVER_PATTERN, MAX_FILE_BYTES, repoRoot);
  return { adrDirAbs, repoRoot, adrDirRel: relative(repoRoot, adrDirAbs), manifest, manifestFindings, waived, io };
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
  const { adrDir, manifestPath, waiverSources, error } = parseArgv(argv);

  if (error) {
    io.stderr.write(`adr-lint: ${error}\n${USAGE}`);
    return EXIT_INVALID;
  }
  if (!adrDir || !isDirectoryPath(adrDir)) {
    io.stderr.write(USAGE);
    return EXIT_INVALID;
  }

  const ctx = resolveRunContext({ adrDir, manifestPath, waiverSources }, io);
  const { files, findings: readFindings } = readAdrFiles(ctx.adrDirAbs, ctx.repoRoot, io);
  const records = files.map((file) => ({ ...file, ...parseDeclaration(file) }));
  const declaring = records.filter(
    (r) => r.declaration && Array.isArray(r.declaration.supersedes) && r.declaration.supersedes.length > 0,
  );

  const findings = [
    ...ctx.manifestFindings,
    ...readFindings,
    ...records.flatMap((r) => r.c0Findings),
    ...checkSupersessionEntries(declaring, records),
    ...runC3({ ...ctx, declaring, runGitGrep }),
  ];

  if (findings.length > 0) {
    for (const finding of findings) io.stdout.write(`${finding}\n`);
    return EXIT_INVALID;
  }

  io.stdout.write(`craft-adr: OK — ${records.length} ADR(s) checked, ${declaring.length} declaring supersession.\n`);
  return EXIT_OK;
}
