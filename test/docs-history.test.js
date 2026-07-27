'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// One representative file per relocated docs tree — proves each file's history
// is followable across the rename: `git log --follow` must surface the pre-move
// path, so a failure here means a tree's history no longer traverses the move.
const MOVED = [
  ['docs/contributing/specs/telemetry.md', 'docs/adapters/telemetry.md'],
  ['docs/guides/customizing.md', 'docs/GUIDE-customizing.md'],
  ['docs/contributing/adr/283-docs-move-redirect-via-manifest-paths.md', 'docs/adr/283-docs-move-redirect-via-manifest-paths.md'],
  ['docs/contributing/design/docs-audience-split.md', 'docs/design/docs-audience-split.md'],
  ['docs/contributing/plan/docs-audience-split.md', 'docs/plan/docs-audience-split.md'],
  ['docs/contributing/archive/SPIKE.md', 'docs/archive/SPIKE.md'],
  ['docs/contributing/prd/DESIGN-history.md', 'docs/DESIGN-history.md'],
  ['docs/contributing/DOD.md', 'docs/DOD.md'],
];

for (const [newPath, oldPath] of MOVED) {
  test(`Given ${newPath}, when git log --follow walks its history, then the pre-move path ${oldPath} appears`, () => {
    const out = execFileSync(
      'git',
      ['log', '--follow', '--name-only', '--format=', '--', newPath],
      { cwd: ROOT, encoding: 'utf8' }
    );

    assert.ok(
      out.includes(oldPath),
      `expected --follow history of ${newPath} to include ${oldPath}; got:\n${out}`
    );
  });
}
