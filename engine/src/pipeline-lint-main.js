import { readFileSync } from 'node:fs';
import { parsePipeline } from './descriptor.js';
import { validatePipeline } from './graph.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

/**
 * Main entrypoint for pipeline-lint logic.
 * @param {string[]} argv — process.argv.slice(2)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const filePath = argv[0];
  if (!filePath) {
    io.stderr.write('Usage: pipeline-lint <pipeline.yml>\n');
    return EXIT_INVALID;
  }

  let descriptors;
  try {
    // 'utf8' vs a Buffer read is an equivalent mutant here — js-yaml coerces a
    // Buffer via String() (utf8 by default), so both yield identical parse input.
    descriptors = parsePipeline(readFileSync(filePath, 'utf8'));
  } catch (err) {
    io.stderr.write(`pipeline-lint: ${err.message}\n`);
    return EXIT_INVALID;
  }

  const { ok, errors } = validatePipeline(descriptors);
  if (!ok) {
    for (const error of errors) io.stderr.write(`  - ${error}\n`);
    return EXIT_INVALID;
  }

  return EXIT_OK;
}
