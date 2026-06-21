import { realpath } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { toolCallGuard, WRITE_TOOLS } from './gate.js';

/**
 * Maps a Pi tool_call event to the shape toolCallGuard expects.
 * Pi field names pinned against @earendil-works/pi-coding-agent@0.79.8.
 * @param {{ tool?: string, name?: string, input?: object, arguments?: object }} event
 * @param {{ workingDir?: string, cwd?: string }} ctx
 * @returns {{ tool: string, tool_input: object, working_dir: string }}
 */
function adaptPiEvent(event, ctx) {
  const tool = event.tool ?? event.name;
  const rawInput = event.input ?? event.arguments ?? {};
  return {
    tool,
    tool_input: rawInput,
    working_dir: ctx.workingDir ?? ctx.cwd ?? '',
  };
}

/**
 * Walks up to the nearest existing ancestor and returns its realpath.
 * DC-5: a not-yet-existing dir cannot be a symlink, so the nearest existing
 * ancestor's realpath is sufficient for containment checking.
 * @param {string} p
 * @returns {Promise<string>}
 */
async function resolveExistingAncestorRealpath(p) {
  try {
    return await realpath(p);
  } catch (err) {
    // EQUIVALENT-MUTANT: `if (false) throw err` — a non-ENOENT error (e.g. EPERM) either
    // re-throws immediately (nominal) or is swallowed and infinite recursion ensues (mutant).
    // Either way the outer symlinkRecheck fail-safe (line 82) catches and returns { block: true }.
    if (err.code !== 'ENOENT') throw err;
    return resolveExistingAncestorRealpath(dirname(p));
  }
}

/**
 * Returns true when realParent is the working dir or a descendant of it.
 * @param {string} realParent
 * @param {string} realWorking
 * @returns {boolean}
 */
function isContained(realParent, realWorking) {
  return realParent === realWorking || realParent.startsWith(realWorking + sep);
}

/**
 * Runtime symlink re-check for write tools (DC-5).
 * Resolves the realpath of the nearest existing ancestor of the TARGET itself
 * and verifies it stays inside the working dir. Resolving the target (not just
 * its parent) means realpath follows a final-component symlink when the target
 * exists — defeating a `cwd/file → /outside` escape the parent-only check missed —
 * while a not-yet-existing target falls back to the nearest existing ancestor
 * (a new dir/file cannot itself be a symlink).
 * @param {{ tool: string, tool_input: { file_path?: string }, working_dir: string }} guardEvent
 * @returns {Promise<{ block: boolean }>}
 */
async function symlinkRecheck({ tool, tool_input, working_dir }) {
  if (!WRITE_TOOLS.has(tool)) return { block: false };
  const realWorking = await realpath(working_dir);
  const target = resolve(realWorking, tool_input.file_path ?? '');
  const realTarget = await resolveExistingAncestorRealpath(target);
  if (isContained(realTarget, realWorking)) return { block: false };
  return { block: true };
}

/**
 * Factory for the live Pi tool_call hook.
 * Adapts Pi events to toolCallGuard's shape, applies the pure predicate,
 * and wraps everything in a fail-safe try/catch.
 * @param {(event: object) => { block: boolean, reason?: string }} [guard]
 * @returns {(event: object, ctx: object) => Promise<{ block: boolean, reason?: string }>}
 */
export function toolCallHook(guard = toolCallGuard) {
  return async (event, ctx) => {
    try {
      const guardEvent = adaptPiEvent(event, ctx);
      const verdict = guard(guardEvent);
      if (verdict.block) return verdict;
      return await symlinkRecheck(guardEvent);
    } catch {
      return { block: true };
    }
  };
}

export { WRITE_TOOLS };
