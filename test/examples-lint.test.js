'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXAMPLES = path.join(ROOT, 'examples');
const MANIFEST_LINT = path.join(ROOT, 'scripts', 'manifest-lint.sh');

function runLint(manifestPath) {
  try {
    const stdout = execFileSync('bash', [MANIFEST_LINT, manifestPath], {
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

function findExampleManifests() {
  return fs
    .readdirSync(EXAMPLES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(EXAMPLES, d.name, 'workflow.md'))
    .filter((p) => fs.existsSync(p));
}

test(
  'Given the examples directory, when listed, then at least one example manifest exists (the loop is non-vacuous)',
  () => {
    const manifests = findExampleManifests();
    assert.ok(manifests.length >= 1, `Expected at least 1 example manifest, found ${manifests.length}`);
  },
);

test(
  'Given every examples/*/workflow.md, when lint runs, then each exits 0 and reports valid',
  () => {
    const manifests = findExampleManifests();
    for (const manifest of manifests) {
      const r = runLint(manifest);
      assert.strictEqual(r.status, 0, `lint failed for ${manifest}:\n${r.output}`);
      assert.ok(r.output.includes('valid.'), `Expected 'valid.' in output for ${manifest}:\n${r.output}`);
    }
  },
);
