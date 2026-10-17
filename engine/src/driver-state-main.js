/**
 * Bin-facing entrypoint for driver-state: lets a driven run report how it
 * ended (finished / blocked) through files in the driver's state directory.
 * Every refusal happens before the first write; `status` is written last.
 */

import * as nodeFs from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { blockedLine, finishedLine, stripPolicyFlags } from './driver-state.js';

const EXIT_OK = 0;
const EXIT_NOT_DRIVEN = 1;
const EXIT_INVALID = 2;
const EXIT_POLICY_LEFTOVER = 3;
const EXIT_STATUS_EXISTS = 4;
const EXIT_WRITE_FAILED = 5;

const ENV_VAR = 'CRAFT_DRIVER_STATE';
const STATUS_FILE = 'status';
const ELECTION_FILE = 'next.md';
const PROMPT_FILE = 'next.prompt';
const ELECTION_FLAG = '--election';
const PROMPT_FLAG = '--prompt';
const ENOENT = 'ENOENT';
const EEXIST = 'EEXIST';
const STDIN_MARK = '-';

const USAGE =
  'usage: driver-state active | finished <pr-url> [--election <md> --prompt <file>] | blocked <phase-id> <reason…|->';

const STDIN_FD = 0;

function readProcessStdin() {
  return nodeFs.readFileSync(STDIN_FD, 'utf8');
}

function fail(message, io) {
  io.stderr.write(`driver-state: ${message}\n`);
  return EXIT_INVALID;
}

function resolveStateDir(env, fs) {
  const value = env[ENV_VAR];
  if (value === undefined || value === '') {
    return { notDriven: true };
  }
  if (!isAbsolute(value)) {
    return { error: `${ENV_VAR} is not an absolute path: ${value}` };
  }
  try {
    if (!fs.statSync(value).isDirectory()) {
      return { error: `${ENV_VAR} is not a directory: ${value}` };
    }
  } catch (error) {
    return { error: statError(value, error) };
  }
  try {
    fs.accessSync(value, nodeFs.constants.W_OK);
  } catch (error) {
    return { error: `${ENV_VAR} is not writable: ${value}: ${error.message}` };
  }
  return { dir: value };
}

function statError(value, error) {
  return error.code === ENOENT
    ? `${ENV_VAR} does not exist: ${value}`
    : `${ENV_VAR}: cannot stat ${value}: ${error.message}`;
}

function parseFinishedArgs(args) {
  const [prUrl, ...options] = args;
  if (prUrl === undefined) {
    return { error: 'finished needs a <pr-url>' };
  }
  if (options.length === 0) {
    return { prUrl };
  }
  const [electionFlag, election, promptFlag, prompt, ...extra] = options;
  const paired = electionFlag === ELECTION_FLAG && promptFlag === PROMPT_FLAG;
  if (!paired || prompt === undefined || extra.length > 0) {
    return { error: `finished takes ${ELECTION_FLAG} <md> ${PROMPT_FLAG} <file> together, or neither` };
  }
  return { prUrl, election, prompt };
}

function readInputs(parsed, fs) {
  if (parsed.election === undefined) {
    return {};
  }
  try {
    return {
      electionText: fs.readFileSync(parsed.election, 'utf8'),
      promptText: fs.readFileSync(parsed.prompt, 'utf8'),
    };
  } catch (error) {
    return { error: `cannot read input: ${error.message}` };
  }
}

function statusAbsent(dir, fs) {
  try {
    fs.lstatSync(join(dir, STATUS_FILE));
    return { exists: true };
  } catch (error) {
    return error.code === ENOENT ? { exists: false } : { error };
  }
}

function removeTemp(tmp, fs) {
  try {
    fs.unlinkSync(tmp);
    return '';
  } catch (error) {
    return error.code === ENOENT ? '' : `; cannot remove ${tmp}: ${error.message}`;
  }
}

// `status` is linked into place, not renamed: a link refuses an existing
// target atomically, so a status that appeared after the guard is never replaced.
function moveIntoPlace(ctx, tmp, name) {
  const target = join(ctx.dir, name);
  if (name !== STATUS_FILE) {
    ctx.fs.renameSync(tmp, target);
    return;
  }
  ctx.fs.linkSync(tmp, target);
  ctx.fs.unlinkSync(tmp);
}

function writeTemp(ctx, tmp, name, content) {
  try {
    ctx.fs.writeFileSync(tmp, content, { flag: 'wx' });
    return EXIT_OK;
  } catch (error) {
    ctx.io.stderr.write(`driver-state: cannot write ${name}: ${error.message}\n`);
    return EXIT_WRITE_FAILED;
  }
}

function publish(ctx, name, content) {
  const tmp = join(ctx.dir, `${name}.tmp.${ctx.pid}`);
  const written = writeTemp(ctx, tmp, name, content);
  if (written !== EXIT_OK) {
    return written;
  }
  try {
    moveIntoPlace(ctx, tmp, name);
    return EXIT_OK;
  } catch (error) {
    const cleanup = removeTemp(tmp, ctx.fs);
    if (error.code === EEXIST) {
      ctx.io.stderr.write(`driver-state: ${name} already exists${cleanup}\n`);
      return EXIT_STATUS_EXISTS;
    }
    ctx.io.stderr.write(`driver-state: cannot write ${name}: ${error.message}${cleanup}\n`);
    return EXIT_WRITE_FAILED;
  }
}

function publishAll(ctx, files) {
  for (const [name, content] of files) {
    const code = publish(ctx, name, content);
    if (code !== EXIT_OK) {
      return code;
    }
  }
  return EXIT_OK;
}

function guardStatus(ctx) {
  const probe = statusAbsent(ctx.dir, ctx.fs);
  if (probe.error) {
    ctx.io.stderr.write(`driver-state: cannot write ${STATUS_FILE}: ${probe.error.message}\n`);
    return EXIT_WRITE_FAILED;
  }
  if (probe.exists) {
    ctx.io.stderr.write(`driver-state: ${STATUS_FILE} already exists\n`);
    return EXIT_STATUS_EXISTS;
  }
  return EXIT_OK;
}

// `-` reads the reason from stdin, so free text never passes through a shell
// command line where `$(…)` or backticks would expand.
function reasonText(ctx, reason) {
  return reason.length === 1 && reason[0] === STDIN_MARK ? ctx.readStdin() : reason.join(' ');
}

function runBlocked(ctx, args) {
  const [phaseId, ...reason] = args;
  const built = blockedLine(phaseId ?? '', reasonText(ctx, reason));
  if (built.error) {
    return fail(built.error, ctx.io);
  }
  const guard = guardStatus(ctx);
  if (guard !== EXIT_OK) {
    return guard;
  }
  return publishAll(ctx, [[STATUS_FILE, `${built.line}\n`]]);
}

function electionFiles(inputs) {
  if (inputs.electionText === undefined) {
    return { files: [], leftovers: [] };
  }
  const stripped = stripPolicyFlags(inputs.promptText);
  return {
    files: [[ELECTION_FILE, inputs.electionText], [PROMPT_FILE, stripped.prompt]],
    leftovers: stripped.leftovers,
  };
}

function validateFinished(ctx, args) {
  const parsed = parseFinishedArgs(args);
  if (parsed.error) {
    return { code: fail(parsed.error, ctx.io) };
  }
  const built = finishedLine(parsed.prUrl);
  if (built.error) {
    return { code: fail(built.error, ctx.io) };
  }
  const inputs = readInputs(parsed, ctx.fs);
  if (inputs.error) {
    return { code: fail(inputs.error, ctx.io) };
  }
  return { line: built.line, inputs };
}

function runFinished(ctx, args) {
  const valid = validateFinished(ctx, args);
  if (valid.code !== undefined) {
    return valid.code;
  }
  const guard = guardStatus(ctx);
  if (guard !== EXIT_OK) {
    return guard;
  }
  const { files, leftovers } = electionFiles(valid.inputs);
  if (leftovers.length > 0) {
    ctx.io.stderr.write(`driver-state: prompt carries policy flags: ${leftovers.join(' ')}\n`);
    return EXIT_POLICY_LEFTOVER;
  }
  return publishAll(ctx, [...files, [STATUS_FILE, `${valid.line}\n`]]);
}

function runActive(ctx) {
  ctx.io.stdout.write(`${ctx.dir}\n`);
  return EXIT_OK;
}

const VERBS = Object.freeze({ active: runActive, finished: runFinished, blocked: runBlocked });

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ env?: object, fs?: object, pid?: number, readStdin?: () => string }} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const [verb, ...args] = argv;
  if (!Object.hasOwn(VERBS, verb ?? '')) {
    return fail(USAGE, io);
  }
  const fs = deps.fs ?? nodeFs;
  const resolved = resolveStateDir(deps.env ?? process.env, fs);
  if (resolved.notDriven) {
    return verb === 'active' ? EXIT_NOT_DRIVEN : fail(`not driven: ${ENV_VAR} is unset`, io);
  }
  if (resolved.error) {
    return fail(resolved.error, io);
  }
  const ctx = {
    io, fs, dir: resolved.dir, pid: deps.pid ?? process.pid, readStdin: deps.readStdin ?? readProcessStdin,
  };
  return VERBS[verb](ctx, args);
}
