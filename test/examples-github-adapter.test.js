'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ADAPTER_DIR = path.join(ROOT, 'examples', 'backlog-github-issues');
const WORKFLOW = path.join(ADAPTER_DIR, 'workflow.md');
const RESOLVE_SCRIPT = path.join(ADAPTER_DIR, 'resolve.sh');
const ADAPTER_README = path.join(ADAPTER_DIR, 'README.md');
const EXAMPLES_README = path.join(ROOT, 'examples', 'README.md');
const MANIFEST_LINT = path.join(ROOT, 'scripts', 'manifest-lint.sh');

test('workflow.md exists and registers extends.backlog-adapters entry', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf8');
  assert.ok(
    content.includes('backlog-adapters'),
    'workflow.md must contain a backlog-adapters registration'
  );
});

test('resolve.sh exists and is executable', () => {
  const stat = fs.statSync(RESOLVE_SCRIPT);
  const isExecutable = (stat.mode & 0o111) !== 0;
  assert.ok(isExecutable, 'resolve.sh must be executable');
});

test('README.md exists and examples/README.md carries an index entry for the adapter', () => {
  assert.ok(fs.existsSync(ADAPTER_README), 'backlog-github-issues/README.md must exist');
  const examplesIndex = fs.readFileSync(EXAMPLES_README, 'utf8');
  assert.ok(
    examplesIndex.includes('backlog-github-issues'),
    'examples/README.md must include a backlog-github-issues index entry'
  );
});

test('manifest-lint.sh exits 0 and reports valid on the example manifest', () => {
  const stdout = execFileSync('bash', [MANIFEST_LINT, WORKFLOW], { encoding: 'utf8' });
  assert.ok(stdout.includes('valid.'), `expected "valid." in manifest-lint output; got: ${stdout}`);
});
