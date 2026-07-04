/**
 * Two-scope named-config read selector: picks the `--config <name>` manifest
 * across local (repo-root .claude/) and user (~/.claude/) scopes. Local always
 * wins when both are present; user is a fallback; neither present is a loud,
 * both-scopes STOP so a caller never silently falls back to a default manifest.
 */

import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { resolveConfigPath } from './init-config.js';
import { containByRealpath as nodeContainByRealpath } from './contain.js';
import { isRegularFile, fail, EXIT_OK, EXIT_ERR } from './cli-io.js';

const MISSING_NAME_MESSAGE = 'config-resolve: name argument required\n';

function invalidNameMessage(error) {
  return `config-resolve: ${error}\n`;
}

function shadowNoteMessage(name) {
  return `config-resolve: user-scope config ${name} is shadowed by local\n`;
}

function userScopeNoteMessage(name) {
  return `config-resolve: ${name} resolved at user scope (~/.claude/craft-${name}.md)\n`;
}

function neitherFoundMessage(name) {
  return `config-resolve: no manifest at ./.claude/craft-${name}.md or ~/.claude/craft-${name}.md\n`;
}

/**
 * Pure candidate builder: validates the name once (via the local-scope call),
 * then derives the user-scope candidate from that same validated name.
 *
 * @param {string} repoRoot
 * @param {string} homeDir
 * @param {string} name
 * @returns {{ ok: true, candidates: Array<{ scope: 'local'|'user', path: string }> } | { ok: false, error: string }}
 */
export function resolveConfigCandidates(repoRoot, homeDir, name) {
  const local = resolveConfigPath(repoRoot, name);
  if (!local.ok) return { ok: false, error: local.error };

  const user = resolveConfigPath(homeDir, name);
  return {
    ok: true,
    candidates: [
      { scope: 'local', path: local.path },
      { scope: 'user', path: user.path },
    ],
  };
}

/**
 * A symlinked `~/.claude` fails containment (null) — that means "no user layer",
 * never an error (mirrors the write-side defaultReadUserPolicy null handling).
 */
function isUserCandidatePresent(userPath, home, fileExists, containByRealpath) {
  const safeUserPath = containByRealpath(join(home, '.claude'), userPath);
  return safeUserPath !== null && fileExists(safeUserPath);
}

/**
 * Annotate each candidate with its presence, applying the user-scope
 * containment guard only to the user candidate.
 */
function withPresence(candidate, home, fileExists, containByRealpath) {
  const present = candidate.scope === 'user'
    ? isUserCandidatePresent(candidate.path, home, fileExists, containByRealpath)
    : fileExists(candidate.path);
  return { ...candidate, present };
}

/**
 * First-present-wins over [local, user]; local first means local wins ties.
 * winner === local AND user present ⇒ shadow note; winner === user ⇒ scope note.
 */
function reportSelection(io, name, annotated) {
  const [, user] = annotated;
  const winner = annotated.find((candidate) => candidate.present);
  if (!winner) return fail(io, neitherFoundMessage(name));

  io.stdout.write(`${winner.path}\n`);
  if (winner.scope === 'local' && user.present) io.stderr.write(shadowNoteMessage(name));
  if (winner.scope === 'user') io.stderr.write(userScopeNoteMessage(name));
  return EXIT_OK;
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ fileExists?: (p: string) => boolean, homeDir?: () => string, containByRealpath?: (root: string, target: string) => string|null }} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const fileExists = deps.fileExists ?? isRegularFile;
  const homeDir = deps.homeDir ?? homedir;
  const containByRealpath = deps.containByRealpath ?? nodeContainByRealpath;

  const name = argv[0];
  if (!name) return fail(io, MISSING_NAME_MESSAGE);

  const repoRoot = resolve(process.cwd());
  const home = homeDir();
  const candidates = resolveConfigCandidates(repoRoot, home, name);
  if (!candidates.ok) return fail(io, invalidNameMessage(candidates.error));

  const annotated = candidates.candidates.map((candidate) =>
    withPresence(candidate, home, fileExists, containByRealpath)
  );
  return reportSelection(io, name, annotated);
}
