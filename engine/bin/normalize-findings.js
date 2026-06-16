#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { normalizeFindings } from '../src/findings.js';

// Empty string (e.g. `argv[2] = ''`) falls through to stdin rather than reading ''.
const filePath = process.argv[2] || null;

function fail(message) {
  process.stderr.write(`normalize-findings: ${message}\n`);
  process.exit(2);
}

let raw;
try {
  raw = filePath ? readFileSync(filePath, 'utf8') : readFileSync(0, 'utf8');
} catch (err) {
  fail(err.message);
}

let findings;
try {
  findings = normalizeFindings(raw);
} catch (err) {
  fail(err.message);
}

process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
process.exit(0);
