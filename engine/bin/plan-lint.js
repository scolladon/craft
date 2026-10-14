#!/usr/bin/env node
import { isEntryPoint } from '../src/cli-io.js';
import { main } from '../src/plan-lint-main.js';
if (isEntryPoint(import.meta.url, process.argv[1])) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
