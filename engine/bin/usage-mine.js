#!/usr/bin/env node
import { isEntryPoint } from '../src/cli-io.js';
import { main } from '../src/observability/usage-mine-main.js';
if (isEntryPoint(import.meta)) {
  process.exit(await main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
