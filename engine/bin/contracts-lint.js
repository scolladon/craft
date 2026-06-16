#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BUNDLE_VOCAB } from '../src/graph.js';

const contractsDir = resolve(process.argv[2] ?? 'contracts');

const failures = [];

for (const name of BUNDLE_VOCAB) {
  const filePath = join(contractsDir, `${name}.md`);

  let content;
  try {
    if (!statSync(filePath).isFile()) {
      failures.push(`contracts-lint: not a regular file: ${filePath}`);
      continue;
    }
    content = readFileSync(filePath, 'utf8');
  } catch {
    failures.push(`contracts-lint: missing bundle file: ${filePath}`);
    continue;
  }

  if (content.trim() === '') {
    failures.push(`contracts-lint: bundle file is empty: ${filePath}`);
    continue;
  }

  if (content.toLowerCase().includes('retrieval')) {
    failures.push(`contracts-lint: bundle "${name}" must not contain "retrieval" (engine derives it): ${filePath}`);
  }
}

if (failures.length > 0) {
  for (const msg of failures) {
    process.stderr.write(`${msg}\n`);
  }
  process.exit(2);
}

process.stdout.write(`contracts-lint: all ${BUNDLE_VOCAB.size} bundles OK (${contractsDir})\n`);
process.exit(0);
