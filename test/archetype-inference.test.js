'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function runCmd(cmd, args = [], opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return {
      status: err.status ?? 1,
      output: (err.stdout ?? '') + (err.stderr ?? ''),
    };
  }
}

test(
  'Given a flat insert entry with gate and no produces, when pipeline-resolve runs, then exits 0 and stdout carries ok:true, inferred-harness tail, smoke, and harness',
  () => {
    const fixture = path.join(
      __dirname,
      'fixtures/manifest/valid-pipeline-insert-infer-archetype.workflow.md',
    );
    const r = runCmd('node', [
      path.join(ROOT, 'engine/bin/pipeline-resolve.js'),
      path.join(ROOT, 'pipeline/default.yml'),
      fixture,
    ]);
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('"ok": true'), `Expected "ok": true in output:\n${r.output}`);
    assert.ok(
      r.output.includes('(inferred: gate with no produces)'),
      `Expected inferred message in output:\n${r.output}`,
    );
    assert.ok(r.output.includes('smoke'), `Expected 'smoke' in output:\n${r.output}`);
    assert.ok(r.output.includes('harness'), `Expected 'harness' in output:\n${r.output}`);
  },
);
