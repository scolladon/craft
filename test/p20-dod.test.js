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
