import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUNDLE_VOCAB } from './graph.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

/**
 * Main entrypoint for contracts-lint logic.
 * @param {string[]} argv — process.argv.slice(2)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const contractsDir = resolve(argv[0] ?? 'contracts');
  const failures = [];

  for (const name of BUNDLE_VOCAB) {
    const filePath = join(contractsDir, `${name}.md`);

    let content;
    try {
      if (!statSync(filePath).isFile()) {
        failures.push(`contracts-lint: not a regular file: ${filePath}`);
        continue;
      }
      content = readFileSync(filePath, 'utf8');
    } catch {
      failures.push(`contracts-lint: missing bundle file: ${filePath}`);
      continue;
    }

    if (content.trim() === '') {
      failures.push(`contracts-lint: bundle file is empty: ${filePath}`);
      continue;
    }

    if (content.toLowerCase().includes('retrieval')) {
      failures.push(`contracts-lint: bundle "${name}" must not contain "retrieval" (engine derives it): ${filePath}`);
    }
  }

  if (failures.length > 0) {
    for (const msg of failures) io.stderr.write(`${msg}\n`);
    return EXIT_INVALID;
  }

  io.stdout.write(`contracts-lint: all ${BUNDLE_VOCAB.size} bundles OK (${contractsDir})\n`);
  return EXIT_OK;
}
