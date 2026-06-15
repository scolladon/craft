#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { parsePipeline } from '../src/descriptor.js';
import { resolvePipeline } from '../src/resolve.js';

const pipelinePath = process.argv[2];
if (!pipelinePath) {
  process.stderr.write('Usage: pipeline-resolve <pipeline.yml> [manifest.yml]\n');
  process.exit(2);
}

let defaults;
try {
  defaults = parsePipeline(readFileSync(pipelinePath, 'utf8'));
} catch (err) {
  process.stderr.write(`pipeline-resolve: failed to parse pipeline: ${err.message}\n`);
  process.exit(2);
}

let manifest = null;
const manifestPath = process.argv[3];
if (manifestPath) {
  try {
    manifest = load(readFileSync(manifestPath, 'utf8')) ?? null;
  } catch (err) {
    process.stderr.write(`pipeline-resolve: failed to parse manifest: ${err.message}\n`);
    process.exit(2);
  }
}

const resolution = resolvePipeline(defaults, manifest);

if (!resolution.ok) {
  for (const error of resolution.errors) {
    process.stderr.write(`  - ${error}\n`);
  }
  process.exit(2);
}

process.stdout.write(JSON.stringify(resolution, null, 2) + '\n');
process.exit(0);
