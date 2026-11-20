#!/usr/bin/env node
import { isEntryPoint } from '../src/cli-io.js';
import { main } from '../src/rulings-migrate-main.js';
if (isEntryPoint(import.meta)) {
  process.exitCode = main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr });
}
