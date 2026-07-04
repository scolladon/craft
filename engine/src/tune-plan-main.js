/**
 * tune-plan entrypoint: read a base named-config + report.json (+ optional memory
 * store), delegate the decision to the pure `planTune`, and emit
 * { proposals, patchedManifest, hasPatch } as JSON on stdout. This layer does only
 * I/O and STOP handling — all tuning judgement lives in planTune.
 *
 * Unlike the miner (advisory on absent input), an absent/unreadable report is a
 * STOP here: the tuner has nothing to act on, so it directs the user to run
 * /craft:metrics first. Memory is optional and advisory — an unreadable store is
 * ignored, never fatal.
 */

import { readFileSync as nodeReadFileSync } from 'node:fs';
import { parseManifestContent } from './frontmatter.js';
import { joinManifest } from './init-emit.js';
import { parseStore } from './observability/memory.js';
import { planTune } from './tune-plan.js';
import { fail, EXIT_OK } from './cli-io.js';

const USAGE = 'tune-plan: usage: tune-plan <base-config-path> <report-path> [--memory <path>]\n';
const TUNED_NOTE = '\n## Tuned\n\nPatched by `craft:tune` from machine-derived usage signals — review the diff before landing.\n';

function parseArgs(argv) {
  const positional = [];
  let memoryPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--memory') { memoryPath = argv[++i] ?? null; continue; }
    positional.push(argv[i]);
  }
  return { basePath: positional[0], reportPath: positional[1], memoryPath };
}

// The markdown body after the second `---` fence, with leading blank lines trimmed
// so joinManifest's own `---\n\n` prefix is not doubled. A fence-less file is all body.
function proseAfterFrontmatter(content) {
  const lines = content.split('\n');
  // equivalent mutants on the fence-less guard (`!== '---'` → false, `?? ''` precedence)
  // and the `.trim()` on the fence: a landed named config is always fenced with clean
  // `---` lines, so the fence-less early return and whitespace tolerance are unobservable
  // in-suite defences; `split('\n')` always yields a non-empty array so `lines[0]` is set.
  if ((lines[0] ?? '').trim() !== '---') return content;
  let delim = 0;
  const body = [];
  for (const line of lines) {
    if (line.trim() === '---') { delim += 1; continue; }
    if (delim >= 2) body.push(line);
  }
  // equivalent mutant (`/^\n+/` → `/\n+/`): the extracted body always begins with the blank
  // line after the second fence, so the first newline run is the leading one either way.
  return body.join('\n').replace(/^\n+/, '');
}

function loadMemory(memoryPath, readFileSync) {
  if (!memoryPath) return null;
  try {
    // equivalent mutant (encoding `'utf8'` → ''): the injected readFileSync ignores the
    // encoding argument; only the real fs distinguishes them, unobservable in-suite.
    return parseStore(readFileSync(memoryPath, 'utf8'));
  } catch {
    // equivalent mutant (block → empty catch): the caller only reads the return as truthy;
    // an implicit undefined and an explicit null both mean "no memory", same downstream.
    return null; // advisory: an unreadable memory store is ignored, never fatal
  }
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ readFileSync?: (p: string, enc: string) => string }} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const readFileSync = deps.readFileSync ?? nodeReadFileSync;
  const { basePath, reportPath, memoryPath } = parseArgs(argv);
  if (!basePath || !reportPath) return fail(io, USAGE);

  // equivalent mutants on the `'utf8'` encoding arg of these three reads: the injected
  // readFileSync ignores the encoding, so only the real fs distinguishes '' from 'utf8'.
  let baseContent;
  try {
    baseContent = readFileSync(basePath, 'utf8');
  } catch {
    return fail(io, `tune-plan: cannot read base config ${basePath}\n`);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return fail(io, `tune-plan: cannot read report ${reportPath} — run /craft:metrics first\n`);
  }

  const memory = loadMemory(memoryPath, readFileSync);
  const baseFrontmatter = parseManifestContent(baseContent) ?? {};
  const prose = proseAfterFrontmatter(baseContent);

  const { proposals, patchedFrontmatter } = planTune({ report, memory, baseFrontmatter });
  const patchedManifest = joinManifest({ frontmatter: patchedFrontmatter, prose: `${prose}${TUNED_NOTE}` });
  const hasPatch = proposals.some(proposal => proposal.path !== null);

  io.stdout.write(`${JSON.stringify({ proposals, patchedManifest, hasPatch }, null, 2)}\n`);
  return EXIT_OK;
}
