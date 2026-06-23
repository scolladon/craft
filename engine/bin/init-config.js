#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { main } from '../src/init-config-main.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr }));
}
