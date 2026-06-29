#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from '../src/usage-mine-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
