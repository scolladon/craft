'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const EXAMPLE_DIR = path.join(ROOT, 'examples', 'deliberation-review');
const WORKFLOW = path.join(EXAMPLE_DIR, 'workflow.md');
const EXAMPLES_README = path.join(ROOT, 'examples', 'README.md');
const MANIFEST_LINT = path.join(ROOT, 'scripts', 'manifest-lint.sh');

test('workflow.md exists', () => {
  assert.ok(fs.existsSync(WORKFLOW), 'examples/deliberation-review/workflow.md must exist');
});

test('manifest-lint.sh exits 0 and reports valid on the example manifest', () => {
  const stdout = execFileSync('bash', [MANIFEST_LINT, WORKFLOW], { encoding: 'utf8' });
  assert.ok(stdout.includes('valid.'), `expected "valid." in manifest-lint output; got: ${stdout}`);
});

test('examples/README.md carries an index entry for the example', () => {
  const examplesIndex = fs.readFileSync(EXAMPLES_README, 'utf8');
  assert.ok(
    examplesIndex.includes('deliberation-review'),
    'examples/README.md must include a deliberation-review index entry'
  );
});
