'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FIXTURES = path.join(__dirname, 'fixtures', 'manifest');
const MANIFEST_LINT = path.join(ROOT, 'scripts', 'manifest-lint.sh');

function runLint(fixturePath) {
  try {
    const stdout = execFileSync('bash', [MANIFEST_LINT, fixturePath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return {
      status: err.status ?? 1,
      output: (err.stdout ?? '') + (err.stderr ?? ''),
    };
  }
}

// ---------------------------------------------------------------------------
// Absent / empty-frontmatter cases
// ---------------------------------------------------------------------------

test(
  'Given a non-existent manifest path, when lint runs, then it exits 0 and reports no manifest',
  () => {
    const r = runLint(path.join(FIXTURES, 'does-not-exist.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('no manifest'), `Expected 'no manifest' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest file with no YAML frontmatter, when lint runs, then it exits 0 and reports pure defaults',
  () => {
    const r = runLint(path.join(FIXTURES, 'no-frontmatter.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('no YAML frontmatter'), `Expected 'no YAML frontmatter' in output:\n${r.output}`);
  },
);

// ---------------------------------------------------------------------------
// Valid manifests
// ---------------------------------------------------------------------------

test(
  'Given a valid basic manifest, when lint runs, then it exits 0 and reports valid',
  () => {
    const r = runLint(path.join(FIXTURES, 'valid-basic.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output:\n${r.output}`);
  },
);

test(
  'Given comma-bearing inline arrays routed through file-ref validation, when lint runs, then it exits 0 (comma-protection regression)',
  () => {
    const r = runLint(path.join(FIXTURES, 'valid-inline-array.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output:\n${r.output}`);
  },
);

test(
  'Given a phase-context path with a trailing comment and quoted colon values, when lint runs, then it exits 0 (comment-strip/quoting regression)',
  () => {
    const r = runLint(path.join(FIXTURES, 'valid-quoting.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output:\n${r.output}`);
  },
);

// ---------------------------------------------------------------------------
// Invalid manifests
// ---------------------------------------------------------------------------

test(
  'Given a manifest with an unknown top-level key, when lint runs, then it exits 2 and reports unknown top-level key',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-unknown-top-key.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('unknown top-level key'), `Expected 'unknown top-level key' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with an unknown phase name, when lint runs, then it exits 2 and reports unknown phase',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-unknown-phase.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('unknown phase'), `Expected 'unknown phase' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with a per-phase skip field, when lint runs, then it exits 2 with legacy-skip guidance',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-skip-protected.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('pipeline.skip'), `Expected 'pipeline.skip' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with pipeline.skip top-level key, when lint runs, then it exits 0 and reports valid',
  () => {
    const r = runLint(path.join(FIXTURES, 'valid-pipeline-skip.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest referencing a missing file, when lint runs, then it exits 2 and reports missing file',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-dangling-file.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('references missing file'), `Expected 'references missing file' in output:\n${r.output}`);
  },
);

test(
  'Given an inline-map gates with an unknown field, when lint runs, then it exits 2 and reports unknown gates field',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-unknown-gates-field.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('unknown gates field'), `Expected 'unknown gates field' in output:\n${r.output}`);
  },
);

// ---------------------------------------------------------------------------
// Fold-introduced code paths — pinned end-to-end through the CLI
// ---------------------------------------------------------------------------

test(
  'Given malformed YAML frontmatter, when lint runs, then it exits 2 with an INVALID manifest message (no crash)',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-malformed-yaml.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('malformed YAML'), `Expected 'malformed YAML' in output:\n${r.output}`);
  },
);

test(
  'Given an unknown pipeline sub-key, when lint runs, then it exits 2 and reports unknown pipeline key',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-unknown-pipeline-key.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('unknown pipeline key'), `Expected 'unknown pipeline key' in output:\n${r.output}`);
  },
);

test(
  'Given a per-phase skip on a non-protected phase, when lint runs, then it exits 2 with legacy-skip guidance',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-skip-nonprotected.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('pipeline.skip'), `Expected 'pipeline.skip' in output:\n${r.output}`);
  },
);

test(
  'Given a directory path as the manifest argument, when lint runs, then it exits 0 and reports no manifest (faithful to [ -f ])',
  () => {
    const r = runLint(FIXTURES);
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('no manifest'), `Expected 'no manifest' in output:\n${r.output}`);
  },
);

// ---------------------------------------------------------------------------
// Canonical phase names + renamed models key
// ---------------------------------------------------------------------------

test(
  'Given a manifest with new canonical phase names and harness-triager model key, when lint runs, then it exits 0 and reports valid',
  () => {
    const r = runLint(path.join(FIXTURES, 'valid-new-phase-names.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with the renamed validation-triager models key, when lint runs, then it exits 2 and reports INVALID manifest with harness-triager guidance',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-renamed-agent-model.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('validation-triager'), `Expected 'validation-triager' in output:\n${r.output}`);
    assert.ok(r.output.includes('harness-triager'), `Expected 'harness-triager' in output:\n${r.output}`);
  },
);

// --- backlog source/shape validation ---

test(
  'Given a manifest with backlog { source: file, ref: existing }, when lint runs, then it exits 0 and reports valid',
  () => {
    const r = runLint(path.join(FIXTURES, 'valid-backlog-file.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with backlog { source: custom, ref: non-path-checked }, when lint runs, then it exits 0 and reports valid',
  () => {
    const r = runLint(path.join(FIXTURES, 'valid-backlog-custom.workflow.md'));
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with backlog as a bare string, when lint runs, then it exits 2 and reports must be an object',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-backlog-string.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('must be an object'), `Expected 'must be an object' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with backlog { source: file, ref: missing-file }, when lint runs, then it exits 2 and reports references missing file',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-backlog-file-bad-ref.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('references missing file'), `Expected 'references missing file' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with backlog { source: custom } and no ref, when lint runs, then it exits 2 and reports ref is required',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-backlog-custom-no-ref.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('ref is required'), `Expected 'ref is required' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with backlog { source: bogus }, when lint runs, then it exits 2 and reports unknown backlog source',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-backlog-unknown-source.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('unknown backlog source'), `Expected 'unknown backlog source' in output:\n${r.output}`);
  },
);

test(
  'Given a manifest with backlog { source: linear }, when lint runs, then it exits 2 and reports use source: custom',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-backlog-linear.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('use source: custom'), `Expected 'use source: custom' in output:\n${r.output}`);
  },
);

test(
  'Given a nested pipeline.insert entry, when lint runs, then it exits 2 and names the entry + reports flat shape',
  () => {
    const r = runLint(path.join(FIXTURES, 'invalid-nested-insert.workflow.md'));
    assert.strictEqual(r.status, 2);
    assert.ok(r.output.includes('INVALID manifest'), `Expected 'INVALID manifest' in output:\n${r.output}`);
    assert.ok(r.output.includes('pipeline.insert[after:implement]'), `Expected 'pipeline.insert[after:implement]' in output:\n${r.output}`);
    assert.ok(r.output.includes('flat shape'), `Expected 'flat shape' in output:\n${r.output}`);
  },
);
