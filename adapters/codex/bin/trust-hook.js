#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main, EXIT_REFUSED } from '../src/trust-hook-main.js';
import { createAppServerRunner } from '../src/app-server-client.js';
import { createAtomicWriter } from '../src/atomic-write.js';
import { resolveCraftRoot } from '../src/craft-root.js';

const MISSING_FILE_ERROR_CODE = 'ENOENT';

// readConfig treats an absent config.toml as the install case, not an error:
// any other read failure (permissions, a directory in its place) rethrows.
function readConfig(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === MISSING_FILE_ERROR_CODE) {
      return '';
    }
    throw error;
  }
}

function buildDependencies() {
  return {
    runAppServer: createAppServerRunner({ spawn }),
    readConfig,
    writeConfig: createAtomicWriter({
      writeFile: writeFileSync,
      rename: renameSync,
      chmod: chmodSync,
      stat: statSync,
      realpath: realpathSync,
      unlink: unlinkSync,
    }),
    guardScriptExists: existsSync,
    resolveRoot: () => resolveCraftRoot(import.meta.url),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // main already catches every internal refusal; this .catch is a last-resort
  // net so a bug in main surfaces as a reasoned exit, never an unhandled
  // rejection.
  main(process.argv.slice(2), buildDependencies())
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      process.stderr.write(`trust-hook: ${error.message}\n`);
      process.exit(EXIT_REFUSED);
    });
}
