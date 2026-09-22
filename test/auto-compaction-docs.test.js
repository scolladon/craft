'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const POC_RECORD_PATH = path.join(ROOT, 'docs/contributing/specs/auto-compaction-poc-record.md');
const CUSTOMIZING_PATH = path.join(ROOT, 'docs/guides/customizing.md');
const CONCEPTS_PATH = path.join(ROOT, 'docs/guides/concepts.md');

const REQUIRED_HEADINGS = [
  '# Auto-compaction PoC — spike evidence record',
  '## Verdict: **GO** (2026-09-21)',
  '## Matrix',
  '## Fire point pins',
  '## Hook payload shapes',
  '## Survival scoring',
  '## Summary-call cost',
  '## Model-triggered compaction routes',
  '## Pinned while designing',
  '## Live smoke (pending)',
];

const CONTENT_ANCHORS = [
  'compact_boundary',
  'isCompactSummary',
  '--path-format=absolute',
  'Compaction blocked by PreCompact hook',
];

test('Given the auto-compaction spike record, when the docs tree is checked, then the page exists', () => {
  const sut = fs.existsSync(POC_RECORD_PATH);

  assert.ok(sut, 'expected docs/contributing/specs/auto-compaction-poc-record.md to exist');
});

test('Given the auto-compaction poc-record page, when its headings are read, then every required heading is present', () => {
  const sut = fs.readFileSync(POC_RECORD_PATH, 'utf8');

  for (const heading of REQUIRED_HEADINGS) {
    assert.ok(sut.includes(heading), `expected heading "${heading}"`);
  }
});

test('Given the auto-compaction poc-record page, when its content is scanned, then every pinned content anchor is present', () => {
  const sut = fs.readFileSync(POC_RECORD_PATH, 'utf8');

  for (const anchor of CONTENT_ANCHORS) {
    assert.ok(sut.includes(anchor), `expected content anchor "${anchor}"`);
  }
});

const FORBIDDEN_PATTERNS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
  /\/Users\//,
  /\/home\//,
  /NONCE-/,
  /agent-[0-9a-f]{6,}/,
  /\.claude\/projects\//,
];

test('Given the auto-compaction poc-record page, when scanned for identifying detail, then no forbidden pattern matches', () => {
  const sut = fs.readFileSync(POC_RECORD_PATH, 'utf8');

  for (const pattern of FORBIDDEN_PATTERNS) {
    assert.ok(!pattern.test(sut), `expected no match for ${pattern}`);
  }
});

test('Given the auto-compaction poc-record page, when scanned for anonymised placeholders, then it uses <sid> and <nonce>', () => {
  const sut = fs.readFileSync(POC_RECORD_PATH, 'utf8');

  assert.ok(sut.includes('<sid>'), 'expected the <sid> placeholder');
  assert.ok(sut.includes('<nonce>'), 'expected the <nonce> placeholder');
});

// Region isolation, the same shape as concepts-frames.test.js's sliceFrom: a
// mention outside the target section can never satisfy a section-scoped
// assertion.
function sliceFrom(content, startPattern, endPattern) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((line) => startPattern.test(line));
  assert.notEqual(startIdx, -1, `region start ${startPattern} not found`);
  const searchFrom = startIdx + 1;
  const relativeEnd = lines.slice(searchFrom).findIndex((line) => endPattern.test(line));
  const endIdx = relativeEnd === -1 ? lines.length : searchFrom + relativeEnd;
  return lines.slice(startIdx, endIdx).join('\n');
}

const GUIDE_TOKENS = [
  'autoCompactWindow',
  '233000',
  '--settings',
  'reorient-after-compact.sh',
  'steer-compact-summary.sh',
  'never writes',
];

test('Given the customizing guide, when the auto-compaction subsection is sliced, then it names the settings knob, both hooks and the never-writes rule', () => {
  const content = fs.readFileSync(CUSTOMIZING_PATH, 'utf8');
  const sut = sliceFrom(
    content,
    /^### Long sessions — auto-compaction \(Claude Code\)$/,
    /^#{2,3} /
  );

  for (const token of GUIDE_TOKENS) {
    assert.ok(sut.includes(token), `expected "${token}" in the auto-compaction subsection`);
  }
});

test('Given the concepts guide, when the memory-protection row is read, then it states the per-line flush rule and drops the old phase-boundary wording', () => {
  const sut = fs.readFileSync(CONCEPTS_PATH, 'utf8');

  assert.ok(!sut.includes('one append per phase boundary'), 'expected the old wording to be gone');
  assert.ok(sut.includes('appended per line as produced'), 'expected the per-line flush wording');
});
