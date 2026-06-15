#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parsePipeline } from '../src/descriptor.js';
import { validatePipeline } from '../src/graph.js';

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Usage: pipeline-lint <pipeline.yml>\n');
  process.exit(2);
}

let descriptors;
try {
  descriptors = parsePipeline(readFileSync(filePath, 'utf8'));
} catch (err) {
  process.stderr.write(`pipeline-lint: ${err.message}\n`);
  process.exit(2);
}

const { ok, errors } = validatePipeline(descriptors);

if (!ok) {
  for (const error of errors) {
    process.stderr.write(`  - ${error}\n`);
  }
  process.exit(2);
}

process.exit(0);
