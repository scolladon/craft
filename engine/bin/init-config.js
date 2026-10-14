#!/usr/bin/env node
import { isEntryPoint } from '../src/cli-io.js';
import { main } from '../src/init-config-main.js';
if (isEntryPoint(import.meta)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
