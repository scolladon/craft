import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINE_SRC_DIR = join(REPO_ROOT, 'engine', 'src');

// The regex literal below is the detector naming what it detects, not a leak.
const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;

// Files that carried provenance breadcrumbs before this guard existed, pinned
// positively so a glob resolving to zero files cannot pass this suite vacuously.
const KNOWN_OFFENDER_FILES = [
  'observability/adapters/claude/telemetry.js',
  'observability/adapters/claude/pricing.js',
  'manifest-harness.js',
  'observability/skip-signals.js',
  'manifest-vocabulary.js',
  'manifest-pipeline-edits.js',
  'manifest.js',
  'gates.js',
];

function engineSourceFiles() {
  return readdirSync(ENGINE_SRC_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

test('Given engine/src, when its *.js files are enumerated recursively, then the resolved set is non-empty', () => {
  const sut = engineSourceFiles();

  assert.ok(sut.length > 0, 'expected engine/src/**/*.js to resolve at least one file');
});

test('Given the enumerated engine/src file set, when each known offender path is checked, then it is present in the set', () => {
  const sut = engineSourceFiles().map((file) => file.slice(ENGINE_SRC_DIR.length + 1));

  for (const offender of KNOWN_OFFENDER_FILES) {
    assert.ok(sut.includes(offender), `expected engine/src/${offender} to be part of the scanned set`);
  }
});

test('Given every scanned engine/src file, when its contents are checked for PROVENANCE_REF, then none match', () => {
  const sut = engineSourceFiles();

  for (const file of sut) {
    const content = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      PROVENANCE_REF,
      `${file.slice(ENGINE_SRC_DIR.length + 1)} carries a provenance reference — state the rationale in prose instead`
    );
  }
});
