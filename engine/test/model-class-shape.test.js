/**
 * Deterministic shape-stability guard.
 *
 * Two invariants, both in-process (no live model calls):
 *
 * 1. Contract model-independence — assembleContract produces a block that is
 *    byte-identical regardless of which model-class pin is the active session,
 *    and contains none of the known model-pin strings.  The contract is a pure
 *    function of descriptor + manifest + fragments + execution mode; a model id
 *    must never appear in the assembled text.
 *
 * 2. normalizeFindings shape-stability — the JSON-array shape and the per-line
 *    shape produced by different model tiers normalize to the same canonical
 *    Finding[].  The engine keys on fields, never on layout, so a model's
 *    output-shape choice cannot change the canonical findings.
 *
 * The stdin path (readFileSync fd-0) is covered by the retained child-process
 * smoke test; in-process units cover the file-path and shape-equivalence branches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { assembleContract } from '../src/contract.js';
import { normalizeFindings } from '../src/findings.js';
import { parsePipeline } from '../src/descriptor.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..');
const contractsDir = join(repoRoot, 'contracts');

// ── Model-class pins documented in the live cross-tier procedure ──────────────

const MODEL_PINS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
];

// Bare tier names that must also be absent (belt-and-suspenders).
const BARE_TIER_NAMES = ['opus', 'sonnet', 'haiku'];

// ── Contract fragments ────────────────────────────────────────────────────────

function readFragment(name) {
  return readFileSync(join(contractsDir, `${name}.md`), 'utf8');
}

const FRAGMENTS = {
  core:           readFragment('core'),
  producer:       readFragment('producer'),
  construction:   readFragment('construction'),
  'harness-read': readFragment('harness-read'),
  'harness-exec': readFragment('harness-exec'),
  delivery:       readFragment('delivery'),
  refinement:     readFragment('refinement'),
};

// ── Descriptors ───────────────────────────────────────────────────────────────

const DESCRIPTORS = parsePipeline(
  readFileSync(join(repoRoot, 'pipeline', 'default.yml'), 'utf8'),
);

// ── Findings shape constants (reuse exact values from normalize-findings-bin.test.js) ──

// Concrete pair — fix present.
const JSON_INPUT = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y' },
]);
const LINE_INPUT = 'HIGH a.js:3 — x | y';

// Concrete pair — fix absent.
const JSON_NOFIX = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' },
]);
const LINE_NOFIX = 'HIGH a.js:3 — x';

// ─── 1. Contract model-independence ──────────────────────────────────────────

// The contract takes no model parameter; MODEL_PINS are used as the axis label
// only — we prove the block is pin-free and pin-invariant.

test('Given the same descriptor and no model parameter, when assembleContract is called, then the assembled block contains no model-pin string', () => {
  const sut = assembleContract;

  for (const descriptor of DESCRIPTORS) {
    const result = sut(descriptor, {}, FRAGMENTS, { execution: 'agent' });

    for (const pin of MODEL_PINS) {
      assert.ok(
        !result.includes(pin),
        `Descriptor "${descriptor.id}": model pin "${pin}" must not appear in the assembled block`,
      );
    }

    for (const tier of BARE_TIER_NAMES) {
      // Case-insensitive: a fragment leaking "Haiku" or "SONNET" is equally wrong.
      assert.ok(
        !result.toLowerCase().includes(tier),
        `Descriptor "${descriptor.id}": bare tier name "${tier}" must not appear in the assembled block`,
      );
    }
  }
});

test('Given identical inputs but the session labelled differently per model class, when assembleContract is called for each pin, then all resulting blocks are byte-identical', () => {
  // assembleContract has no model parameter — the "axis" we enumerate here is
  // only the documented MODEL_PINS list; they cannot influence the output.
  // We assemble once per descriptor per execution mode and confirm each call
  // (standing in for opus / sonnet / haiku) produces the same bytes.
  const sut = assembleContract;

  for (const descriptor of DESCRIPTORS) {
    for (const mode of /** @type {const} */ (['agent', 'inline'])) {
      const blocks = MODEL_PINS.map(() =>
        sut(descriptor, {}, FRAGMENTS, { execution: mode }),
      );

      const reference = blocks[0];
      for (let i = 1; i < blocks.length; i++) {
        assert.strictEqual(
          blocks[i],
          reference,
          `Descriptor "${descriptor.id}" mode "${mode}": block for pin[${i}] ("${MODEL_PINS[i]}") differs from pin[0] ("${MODEL_PINS[0]}")`,
        );
      }
    }
  }
});

// ─── 2. normalizeFindings shape-stability (R10 discharge) ────────────────────

test('Given a JSON-array finding and a per-line finding for the same data (fix present), when normalizeFindings is called on each, then the results deep-equal', () => {
  const sut = normalizeFindings;

  const result = sut(JSON_INPUT);
  const fromLine = sut(LINE_INPUT);

  assert.deepEqual(
    result,
    fromLine,
    'JSON-array and per-line shapes must normalize to the same canonical Finding[]',
  );
});

test('Given a JSON-array finding and a per-line finding for the same data (fix absent), when normalizeFindings is called on each, then the results deep-equal and fix is absent', () => {
  const sut = normalizeFindings;

  const result = sut(JSON_NOFIX);
  const fromLine = sut(LINE_NOFIX);

  assert.deepEqual(
    result,
    fromLine,
    'JSON-array and per-line shapes (no fix) must normalize to the same canonical Finding[]',
  );

  assert.ok(
    !Object.hasOwn(result[0], 'fix'),
    'fix key must be genuinely absent when no fix was given (JSON shape)',
  );
  assert.ok(
    !Object.hasOwn(fromLine[0], 'fix'),
    'fix key must be genuinely absent when no fix was given (per-line shape)',
  );
});

test('Given JSON-array and per-line inputs for the same finding, when normalizeFindings is called, then both canonical arrays are deeply equal to the expected Finding object', () => {
  const sut = normalizeFindings;
  const expected = [{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y' }];

  const fromJson = sut(JSON_INPUT);
  const fromLine = sut(LINE_INPUT);

  assert.deepEqual(fromJson, expected);
  assert.deepEqual(fromLine, expected);
});

test('Given fix-absent inputs in both shapes, when normalizeFindings is called, then both canonical arrays equal the expected fix-free Finding object', () => {
  const sut = normalizeFindings;
  const expected = [{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' }];

  const fromJson = sut(JSON_NOFIX);
  const fromLine = sut(LINE_NOFIX);

  assert.deepEqual(fromJson, expected);
  assert.deepEqual(fromLine, expected);
});
