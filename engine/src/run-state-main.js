/**
 * Bin-facing entrypoint for run-state: reads a ledger file and the resolved
 * pipeline (via stdin JSON), replays them through deriveRunState, and maps
 * the pure result onto stdout/stderr and an exit code.
 */

import { readFileSync } from 'node:fs';
import { deriveRunState } from './run-state.js';

const RUN_FLAG = '--run';

const EXIT_OK = 0;
const EXIT_MISMATCH = 1;
const EXIT_INVALID = 2;

/**
 * @param {string} message
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {2}
 */
function fail(message, io) {
  io.stderr.write(`run-state: ${message}\n`);
  return EXIT_INVALID;
}

/**
 * Pulls `--run <id>` out of argv, in either position; whatever positional
 * remains is the ledger path.
 * @param {string[]} argv
 * @returns {{ runId: string, ledgerPath: string } | { error: string }}
 */
function parseArgs(argv) {
  const runIndex = argv.indexOf(RUN_FLAG);
  if (runIndex === -1) {
    return { error: 'missing --run' };
  }
  const runId = argv[runIndex + 1];
  if (runId === undefined) {
    return { error: 'missing --run value' };
  }
  const rest = [...argv.slice(0, runIndex), ...argv.slice(runIndex + 2)];

  const unknownFlag = rest.find((arg) => arg.startsWith('--'));
  if (unknownFlag) {
    return { error: `unknown option ${unknownFlag}` };
  }
  if (rest.length === 0) {
    return { error: 'missing ledger path' };
  }
  if (rest.length > 1) {
    return { error: `unexpected argument ${rest[1]}` };
  }

  return { runId, ledgerPath: rest[0] };
}

/**
 * Read the ledger file and the resolution JSON from stdin.
 * @param {string} ledgerPath
 * @param {{ readStdin: () => string }} io
 * @returns {{ lines: string[], resolution: object } | { error: string }}
 */
function readInputs(ledgerPath, io) {
  let ledgerText;
  try {
    ledgerText = readFileSync(ledgerPath, 'utf8');
  } catch (err) {
    return { error: err.message };
  }

  let resolution;
  try {
    resolution = JSON.parse(io.readStdin());
  } catch (err) {
    return { error: err.message };
  }
  if (!Array.isArray(resolution?.effective)) {
    return { error: 'resolution JSON must have an effective array' };
  }

  return { lines: ledgerText.split('\n'), resolution };
}

/**
 * @param {string[] | null} ledger
 * @param {string[]} resolution
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {1}
 */
function reportMismatch(ledger, resolution, io) {
  const ledgerSide = ledger === null ? 'absent' : ledger.join(',');
  io.stderr.write(
    `run-state: AWAITING(propose) mismatch — ledger: ${ledgerSide}; resolution: ${resolution.join(',')}\n`,
  );
  return EXIT_MISMATCH;
}

/**
 * @param {{ kind: 'state', state: object } | { kind: 'awaiting-mismatch', ledger: string[]|null, resolution: string[] }} result
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
function render(result, io) {
  if (result.kind === 'awaiting-mismatch') {
    return reportMismatch(result.ledger, result.resolution, io);
  }
  io.stdout.write(`${JSON.stringify(result.state, null, 2)}\n`);
  return EXIT_OK;
}

/**
 * @param {string[]} argv — process.argv.slice(2)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void }, readStdin: () => string }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const args = parseArgs(argv);
  if ('error' in args) {
    return fail(args.error, io);
  }

  const inputs = readInputs(args.ledgerPath, io);
  if ('error' in inputs) {
    return fail(inputs.error, io);
  }

  const result = deriveRunState(inputs.lines, args.runId, inputs.resolution);
  return render(result, io);
}
