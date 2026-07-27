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

test(
  'Given every auto-discovered example dir, when README is scanned, then each appears as a linked ](<dir>/) token',
  () => {
    const sut = fs.readFileSync(path.join(EXAMPLES, 'README.md'), 'utf8');
    const dirs = findExampleManifests().map((p) => path.basename(path.dirname(p)));
    assert.ok(dirs.length >= 1, 'discovery returned no example dirs — the coverage check would be vacuous');
    const missing = dirs.filter((dir) => !sut.includes(`](${dir}/)`));
    assert.deepStrictEqual(missing, [], `examples/README.md missing linked rows for: ${missing.join(', ')}`);
  },
);

test(
  'Given every ](<dir>/) link in the README, when resolved, then each targets an existing example dir with a manifest',
  () => {
    const sut = fs.readFileSync(path.join(EXAMPLES, 'README.md'), 'utf8');
    const linked = [...sut.matchAll(/\]\(([a-z0-9][a-z0-9-]*)\/\)/g)].map((m) => m[1]);
    assert.ok(linked.length >= 1, 'no ](<dir>/) links found — the resolution check would be vacuous');
    const stale = linked.filter((dir) => !fs.existsSync(path.join(EXAMPLES, dir, 'workflow.md')));
    assert.deepStrictEqual(stale, [], `examples/README.md links dirs with no workflow.md: ${stale.join(', ')}`);
  },
);

test(
  'Given the README index-number column, when all numbers are collected, then none is duplicated',
  () => {
    const sut = fs.readFileSync(path.join(EXAMPLES, 'README.md'), 'utf8');
    const numbers = sut
      .split('\n')
      .filter((line) => line.startsWith('|'))
      .flatMap((line) => (line.split('|')[1] ?? '').match(/\d+/g) ?? []);
    const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    assert.deepStrictEqual(duplicates, [], `examples/README.md duplicates index numbers: ${duplicates.join(', ')}`);
  },
);
