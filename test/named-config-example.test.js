'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const EXAMPLE_DIR = path.join(ROOT, 'examples', 'named-config');
const WORKFLOW = path.join(EXAMPLE_DIR, 'workflow.md');
const README_PATH = path.join(EXAMPLE_DIR, 'README.md');
const MANIFEST_LINT = path.join(ROOT, 'scripts', 'manifest-lint.sh');

test('named-config example workflow.md exists and manifest-lint.sh exits 0 on it', () => {
  assert.ok(fs.existsSync(WORKFLOW), 'examples/named-config/workflow.md must exist');
  const stdout = execFileSync('bash', [MANIFEST_LINT, WORKFLOW], { encoding: 'utf8' });
  assert.ok(
    stdout.includes('valid.'),
    `manifest-lint must report the manifest valid; got: ${stdout}`
  );
});

test('named-config example README.md is present', () => {
  assert.ok(fs.existsSync(README_PATH), 'examples/named-config/README.md must exist');
});
