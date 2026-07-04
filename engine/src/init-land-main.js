/**
 * Main entrypoint for init-land logic.
 * argv[0] = tmpPath, argv[1] = name, optional --scope user|local (default local).
 * Scope selects the write-root: local = repo root (unchanged today's behaviour),
 * user = homeDir() — same pure resolveConfigPath, different root.
 * Exits 0 on successful lint+move; non-zero on bad args/scope, an invalid name,
 * a containment-null user root (symlinked ~/.claude), or a lint/rename failure.
 */

import { renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { land } from './init-land.js';
import { resolveConfigPath } from './init-config.js';
import { containByRealpath as nodeContainByRealpath } from './contain.js';
import { isRegularFile, fail, EXIT_OK, EXIT_ERR } from './cli-io.js';

const SCOPE_LOCAL = 'local';
const SCOPE_USER = 'user';
const SCOPES = new Set([SCOPE_LOCAL, SCOPE_USER]);

const USAGE_MESSAGE = 'init-land: usage: init-land <tmp-path> <name> [--scope user|local]\n';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_LINT_SCRIPT = join(REPO_ROOT, 'scripts', 'manifest-lint.sh');

function badScopeMessage(scope) {
  return `init-land: unknown --scope "${scope}": must be one of ${[...SCOPES].join(', ')}\n`;
}

function invalidNameMessage(error) {
  return `init-land: ${error}\n`;
}

function containmentFailureMessage() {
  return 'init-land: cannot safely resolve user scope — ~/.claude escapes containment\n';
}

function shadowWarnMessage(name) {
  return `init-land: warning: local .claude/craft-${name}.md exists and will shadow this user-scope config at read time\n`;
}

export function buildLintDep() {
  return (tmpPath) => {
    try {
      execFileSync('bash', [MANIFEST_LINT_SCRIPT, tmpPath], { encoding: 'utf8' });
      return { exitCode: 0, errors: [] };
    } catch (err) {
      // equivalent mutant (?? fallback value, e.g. '' -> "Stryker was here!"): manifest-lint-main.js's only
      // non-zero-exit path (failInvalid) always writes stderr, so err.stderr is never nullish here; the
      // fallback is unreachable through this fixed 'bash'+MANIFEST_LINT_SCRIPT invocation.
      // equivalent mutant (.trim() removed, e.g. line.trim().length>0 -> line.length>0): every line this
      // script can emit is either fully empty ('') or carries a fixed non-whitespace prefix ('- ', 'craft-manifest:',
      // 'Fix the manifest', ' N | ', '-----^') — verified against both a missing-ref failure and a malformed-YAML
      // failure — so trim() never flips a line's emptiness classification.
      const lines = (err.stderr ?? '').split('\n').filter((line) => line.trim().length > 0);
      // equivalent mutant (lines.length>0 -> true / >=0, or the ['manifest lint failed'] else-branch -> [] / [""]):
      // failInvalid() always writes >=2 non-blank lines on failure, so lines.length is always >0 for this real
      // wiring — the else-branch and its guard are unreachable defensive fallbacks, never observably exercised.
      return {
        exitCode: err.status ?? EXIT_ERR,
        errors: lines.length > 0 ? lines : ['manifest lint failed'],
      };
    }
  };
}

function parseScope(argv) {
  const flagIdx = argv.indexOf('--scope');
  return flagIdx === -1 ? SCOPE_LOCAL : argv[flagIdx + 1];
}

/**
 * A local same-name config always shadows a user-scope one at read time
 * (config-resolve.js picks local first) — advisory only, the move still proceeds.
 */
function shadowedByLocal(name, fileExists) {
  const local = resolveConfigPath(resolve(process.cwd()), name);
  return local.ok && fileExists(local.path);
}

function resolveFinalPath(scope, candidatePath, home, containByRealpath) {
  if (scope !== SCOPE_USER) return candidatePath;
  return containByRealpath(join(home, '.claude'), candidatePath);
}

function landAndReport({ tmpPath, finalPath }, deps, io) {
  const result = land({ tmpPath, finalPath }, deps);
  if (!result.ok) {
    for (const err of result.errors) io.stderr.write(`${err}\n`);
    return EXIT_ERR;
  }
  io.stdout.write(`${result.path}\n`);
  return EXIT_OK;
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ homeDir?: () => string, fileExists?: (p: string) => boolean, containByRealpath?: (root: string, target: string) => string|null, lint?: (p: string) => { exitCode: number, errors: string[] }, rename?: (from: string, to: string) => void }} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const homeDir = deps.homeDir ?? homedir;
  const fileExists = deps.fileExists ?? isRegularFile;
  const containByRealpath = deps.containByRealpath ?? nodeContainByRealpath;
  const lint = deps.lint ?? buildLintDep();
  const rename = deps.rename ?? renameSync;

  const tmpPath = argv[0];
  const name = argv[1];
  const scope = parseScope(argv);

  if (!tmpPath || !name) return fail(io, USAGE_MESSAGE);
  if (!SCOPES.has(scope)) return fail(io, badScopeMessage(scope));

  const home = homeDir();
  const root = scope === SCOPE_USER ? home : resolve(process.cwd());
  const res = resolveConfigPath(root, name);
  if (!res.ok) return fail(io, invalidNameMessage(res.error));

  const finalPath = resolveFinalPath(scope, res.path, home, containByRealpath);
  if (finalPath === null) return fail(io, containmentFailureMessage());

  if (scope === SCOPE_USER && shadowedByLocal(name, fileExists)) {
    io.stderr.write(shadowWarnMessage(name));
  }

  return landAndReport({ tmpPath, finalPath }, { lint, rename }, io);
}
