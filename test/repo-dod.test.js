'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test(
  'Given docs/contributing/DOD.md is the repo DoD artifact, when its path is checked, then it exists',
  () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/contributing/DOD.md')), 'docs/contributing/DOD.md should exist');
  },
);

test(
  'Given docs/contributing/DOD.md exists, when its size is checked, then it is non-empty',
  () => {
    const stat = fs.statSync(path.join(ROOT, 'docs/contributing/DOD.md'));
    assert.ok(stat.size > 0, 'docs/contributing/DOD.md should be non-empty');
  },
);

test(
  'Given docs/contributing/DOD.md exists, when its content is checked, then it contains at least one checklist line',
  () => {
    try {
      execFileSync('grep', ['-qE', '^- \\[[ xX]\\] ', path.join(ROOT, 'docs/contributing/DOD.md')], {
        stdio: 'ignore',
      });
    } catch {
      assert.fail('docs/contributing/DOD.md should contain at least one checklist line (- [ ] or - [x])');
    }
  },
);

test(
  'Given docs/contributing/DOD.md exists, when its content is checked, then it includes a harness-techniques triaged-or-documented durable bar line',
  () => {
    try {
      execFileSync(
        'grep',
        ['-qiE', 'harness techniques triaged|triaged-or-documented', path.join(ROOT, 'docs/contributing/DOD.md')],
        { stdio: 'ignore' },
      );
    } catch {
      assert.fail(
        'docs/contributing/DOD.md should include a harness-techniques triaged-or-documented bar line',
      );
    }
  },
);

test(
  'Given the rule-vs-fact criterion is asserted, when DOD.md is read, then the id appears in the frontmatter and on a checklist line',
  () => {
    const content = fs.readFileSync(path.join(ROOT, 'docs/contributing/DOD.md'), 'utf8');

    assert.ok(content.includes('- id: rule-vs-fact-stated'), 'Expected "- id: rule-vs-fact-stated" in the DOD.md frontmatter');
    // Checklist bullets wrap across lines in this file (see architecture-gap-honest); the
    // criterion id closes the bullet's last physical line, so match the whole wrapped bullet.
    assert.ok(
      /^- \[ \] [^\n]*(?:\n(?!- \[)[^\n]*)*`rule-vs-fact-stated`$/m.test(content),
      'Expected a checklist bullet ending in `rule-vs-fact-stated` in DOD.md',
    );
  },
);

test(
  'Given the amended criteria list, when dod-assert runs over the real DOD.md, then it exits 0 and reports the new criterion as judgment',
  () => {
    const stdout = execFileSync('node', [
      path.join(ROOT, 'engine/bin/dod-assert.js'),
      path.join(ROOT, 'docs/contributing/DOD.md'),
      ROOT,
      '',
    ]).toString('utf8');

    const { outcomes } = JSON.parse(stdout);

    assert.deepStrictEqual(
      outcomes.find((outcome) => outcome.id === 'rule-vs-fact-stated'),
      { id: 'rule-vs-fact-stated', kind: 'judgment', outcome: 'judgment' },
    );
  },
);
