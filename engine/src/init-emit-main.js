import { readFileSync, writeFileSync } from 'node:fs';
import { emitManifest, joinManifest } from './init-emit.js';

const EXIT_OK = 0;
const EXIT_ERROR = 1;

/**
 * Emit a diagnostic message to stderr and return EXIT_ERROR.
 * @param {string} message
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {1}
 */
function fail(message, io) {
  io.stderr.write(`init-emit: ${message}\n`);
  return EXIT_ERROR;
}

/**
 * Read answers JSON from a file path or stdin.
 * @param {string|null} filePath
 * @param {{ readStdin: () => string }} io
 * @returns {string}
 */
function readAnswersRaw(filePath, io) {
  // equivalent mutant (StringLiteral ""): readFileSync(path,"") returns Buffer; JSON.parse(Buffer) calls Buffer.toString() first — identical result
  if (filePath) return readFileSync(filePath, 'utf8');
  return io.readStdin();
}

/**
 * Main entrypoint for init-emit logic.
 * argv[0] — path to answers JSON file (or absent for stdin).
 * argv[1] — output path to write the manifest.
 *
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void }, readStdin?: () => string }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const answersPath = argv[0] || null;
  const outPath = argv[1] || null;

  if (!outPath) {
    return fail('usage: init-emit <answers.json> <out-path>', io);
  }

  let raw;
  try {
    raw = readAnswersRaw(answersPath, io);
  } catch (err) {
    return fail(`cannot read answers: ${err.message}`, io);
  }

  let answers;
  try {
    answers = JSON.parse(raw);
  } catch (err) {
    return fail(`malformed answers JSON: ${err.message}`, io);
  }

  if (answers === null || typeof answers !== 'object' || Array.isArray(answers)) {
    return fail('answers JSON must be a non-null object', io);
  }

  const { frontmatter, prose } = emitManifest(answers);
  const manifest = joinManifest({ frontmatter, prose });

  try {
    // equivalent mutant (StringLiteral ""): writeFileSync with "" encoding writes string content identically to 'utf8'
    writeFileSync(outPath, manifest, 'utf8');
  } catch (err) {
    return fail(`cannot write manifest: ${err.message}`, io);
  }

  return EXIT_OK;
}
