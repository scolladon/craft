/**
 * Orchestrates the scriptable hook-trust flow: parse argv, locate
 * config.toml and the craft guard script, ask codex `app-server` what it
 * currently knows about the registered hook, and either report or persist
 * the trust decision. Every I/O boundary — the app-server round trip, the
 * config read/write, the guard-script existence check, the environment and
 * the output streams — is injected, so this module never imports `node:fs`
 * or `node:child_process` itself; the caller in `bin/trust-hook.js` binds
 * the real ones.
 */

import { join } from 'node:path';
import {
  buildRequests,
  parseHooksList,
  selectCraftHook,
  planTrust,
  describeListingEntry,
  GUARD_SCRIPT_SEGMENTS,
  ACTION_NOOP,
} from './hook-trust.js';
import { upsertTrustedHash } from './config-toml-trust.js';
import { toDisplayText } from './safe-text.js';

export const EXIT_OK = 0;
export const EXIT_UNTRUSTED = 1;
export const EXIT_REFUSED = 2;

const OUTPUT_PREFIX = 'trust-hook: ';
const ARG_CHECK = '--check';
const CONFIG_FILE_NAME = 'config.toml';
const CODEX_HOME_DIR_NAME = '.codex';

// Named here, not in hook-trust.js: the app-server runner takes the awaited
// response id as a caller-supplied parameter rather than owning a fixed one,
// so the id this flow waits for belongs to the caller that names it.
const HOOKS_LIST_RESPONSE_ID = 2;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function parseCheckMode(argv) {
  if (argv.length === 0) {
    return false;
  }
  if (argv.length === 1 && argv[0] === ARG_CHECK) {
    return true;
  }
  throw new Error(`unrecognised argument(s): ${argv.join(' ')}`);
}

function resolveConfigPath(env) {
  if (isNonEmptyString(env.CODEX_HOME)) {
    return join(env.CODEX_HOME, CONFIG_FILE_NAME);
  }
  if (isNonEmptyString(env.HOME)) {
    return join(env.HOME, CODEX_HOME_DIR_NAME, CONFIG_FILE_NAME);
  }
  throw new Error('neither CODEX_HOME nor HOME is set — refusing to resolve a config path');
}

function assertGuardScriptPresent(root, guardScriptExists) {
  const guardScriptPath = join(root, ...GUARD_SCRIPT_SEGMENTS);
  if (!guardScriptExists(guardScriptPath)) {
    throw new Error(`craft guard script not found at ${guardScriptPath}`);
  }
}

async function fetchHooksListing({ runAppServer, cwd, env }) {
  const requests = buildRequests({ cwd });
  const stdoutText = await runAppServer({ requests, cwd, env, responseId: HOOKS_LIST_RESPONSE_ID });
  return parseHooksList(stdoutText, { requestId: HOOKS_LIST_RESPONSE_ID });
}

function reportWarnings(warnings, stdout) {
  for (const warning of warnings) {
    stdout.write(`${OUTPUT_PREFIX}warning: ${toDisplayText(describeListingEntry(warning))}\n`);
  }
}

// Reported whatever the outcome: an error means the listing this decision was
// arbitrated on was partial, which matters just as much when a hook DID match
// as when none did — a second, unreported registration could be the one
// actually guarding the session.
function reportErrors(errors, stderr) {
  for (const error of errors) {
    stderr.write(`${OUTPUT_PREFIX}listing error: ${toDisplayText(describeListingEntry(error))}\n`);
  }
}

function selectAndAnnounceHook(hooks, errors, stdout) {
  const hook = selectCraftHook(hooks, { errors });
  const sourcePath = toDisplayText(hook.sourcePath);
  const command = toDisplayText(hook.command);
  stdout.write(`${OUTPUT_PREFIX}matched hook sourcePath=${sourcePath} command=${command}\n`);
  return hook;
}

function assertEnabled(plan) {
  if (plan.enabled === true) {
    return;
  }
  const reason = plan.enabled === false ? 'is disabled' : 'has an enabled field that is missing or not a boolean';
  throw new Error(`matched hook ${reason} (key=${toDisplayText(plan.key)})`);
}

// Applies to reporting trust as much as to writing it: an unloadable hook
// config means the registration actually guarding the session may be one this
// listing never carried, so "already trusted" is as unsupported an answer as a
// write would be. Both modes refuse, or a pipeline reading only --check's exit
// code passes on the state the write path calls unsafe.
function assertListingComplete(errors) {
  if (errors.length > 0) {
    throw new Error(
      `codex reported ${errors.length} hook-config error(s), so the listing is incomplete — refusing to answer from a partial listing`
    );
  }
}

function reportCheckOutcome(plan, stdout) {
  const key = toDisplayText(plan.key);
  stdout.write(`${OUTPUT_PREFIX}check: key=${key} from=${plan.from} action=${plan.action}\n`);
  return plan.action === ACTION_NOOP ? EXIT_OK : EXIT_UNTRUSTED;
}

function applyWriteOutcome(plan, { configPath, readConfig, writeConfig, stdout }) {
  const key = toDisplayText(plan.key);
  if (plan.action === ACTION_NOOP) {
    stdout.write(`${OUTPUT_PREFIX}already trusted: key=${key} from=${plan.from}\n`);
    return EXIT_OK;
  }

  const nextConfig = upsertTrustedHash(readConfig(configPath), { key: plan.key, hash: plan.hash });
  writeConfig(configPath, nextConfig);
  stdout.write(`${OUTPUT_PREFIX}trusted key=${key} from=${plan.from} hash=${toDisplayText(plan.hash)}\n`);
  return EXIT_OK;
}

async function run(argv, deps) {
  const { runAppServer, readConfig, writeConfig, guardScriptExists, resolveRoot, env, stdout, stderr } = deps;
  const checkMode = parseCheckMode(argv);
  const configPath = resolveConfigPath(env);
  const root = resolveRoot();
  assertGuardScriptPresent(root, guardScriptExists);

  const { hooks, warnings, errors } = await fetchHooksListing({ runAppServer, cwd: root, env });
  reportWarnings(warnings, stdout);
  reportErrors(errors, stderr);
  const hook = selectAndAnnounceHook(hooks, errors, stdout);
  const plan = planTrust(hook);
  assertEnabled(plan);
  assertListingComplete(errors);

  return checkMode
    ? reportCheckOutcome(plan, stdout)
    : applyWriteOutcome(plan, { configPath, readConfig, writeConfig, stdout });
}

/**
 * @param {string[]} argv
 * @param {{ runAppServer: Function, readConfig: Function, writeConfig: Function,
 *   guardScriptExists: Function, resolveRoot: Function, env: object,
 *   stdout: { write(s: string): void }, stderr: { write(s: string): void } }} deps
 * @returns {Promise<number>} exit code
 */
export async function main(argv, deps) {
  try {
    return await run(argv, deps);
  } catch (error) {
    deps.stderr.write(`${OUTPUT_PREFIX}${toDisplayText(error.message)}\n`);
    return EXIT_REFUSED;
  }
}
