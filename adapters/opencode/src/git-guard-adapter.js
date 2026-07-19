import { gitGuardPredicate } from './git-guard-predicate.js';

/**
 * Extracts the bash command string from opencode's `tool.execute.before(input, output)`.
 * Live-pinned against opencode 1.18.3: the first arg carries the tool name and ids
 * (`{ tool: 'bash', sessionID, callID }`) and the command string lives in
 * `output.args.command`. The `input.args.command` fallback is retained defensively.
 * @param {{ tool?: string, args?: { command?: string } }} [input]
 * @param {{ args?: { command?: string } }} [output]
 * @returns {string}
 */
export function commandFromToolEvent(input, output) {
  return output?.args?.command ?? input?.args?.command ?? '';
}

/**
 * Composes command extraction with the pure git-guard predicate.
 * @param {object} input   the tool-event descriptor (`{ tool, sessionID, callID }`)
 * @param {object} output  the mutable tool args (`{ args: { command } }`)
 * @param {(command: string) => { block: boolean, reason?: string }} [guard]
 * @returns {{ block: boolean, reason?: string }}
 */
export function decideGuard(input, output, guard = gitGuardPredicate) {
  return guard(commandFromToolEvent(input, output));
}
