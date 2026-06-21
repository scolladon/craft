#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from './run.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // EQUIVALENT-MUTANT: process.argv vs process.argv.slice(2) — main() declares _argv but never
  // reads it, so stripping the node/cli prefix has no observable effect on current behaviour.
  const result = await main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
  process.exit(result.code);
}
