'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');
const BIN = path.join(ROOT, 'engine', 'bin', 'intention-lint.js');

// Mirrors ci.sh's own enumeration of the design's zero-config corpus
// (docs/adapters/*.md, docs/DESIGN-*.md, docs/DOD.md, docs/GUIDE-customizing.md)
// plus BACKLOG.md — see docs/design/intention-port.md "Zero-config probe".
function mdFilesIn(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(dir, name));
}

function enumerateCorpus() {
  const adapterPages = mdFilesIn(path.join(ROOT, 'docs', 'adapters'));
  const designDocs = fs
    .readdirSync(path.join(ROOT, 'docs'))
    .filter((name) => /^DESIGN-.*\.md$/.test(name))
    .map((name) => path.join(ROOT, 'docs', name));
  const fixedPages = [
    path.join(ROOT, 'docs', 'DOD.md'),
    path.join(ROOT, 'docs', 'GUIDE-customizing.md'),
  ];
  return [...adapterPages, ...designDocs, ...fixedPages, path.join(ROOT, 'BACKLOG.md')];
}

test('Given scripts/ci.sh, when its content is read, then it invokes intention-lint', () => {
  const content = fs.readFileSync(CI_SCRIPT, 'utf8');

  assert.ok(content.includes('intention-lint'), 'expected scripts/ci.sh to reference intention-lint');
});

test('Given the real enumerated living corpus plus BACKLOG.md, when intention-lint runs over it, then it exits 0', () => {
  const files = enumerateCorpus();

  const result = execFileSync('node', [BIN, ...files], { cwd: ROOT, encoding: 'utf8' });

  assert.match(result, /^craft-intention: OK/);
});
