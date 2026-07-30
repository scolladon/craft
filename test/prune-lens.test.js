'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PRUNE_SKILL = path.join(ROOT, 'skills', 'prune', 'SKILL.md');
const CORE_CONTRACT = path.join(ROOT, 'contracts', 'core.md');

test(
  'Given skills/prune/SKILL.md, when its inspection scope is read, then it carries the rule-vs-fact class',
  () => {
    const content = fs.readFileSync(PRUNE_SKILL, 'utf8');

    assert.ok(content.includes('Rule-vs-fact'), 'Expected "Rule-vs-fact" heading in skills/prune/SKILL.md');
    assert.ok(content.includes('decision procedure'), 'Expected phrase "decision procedure" in skills/prune/SKILL.md');
  },
);

test(
  'Given the two prune classes must be greppable apart, when the output section is read, then the fixed rule-vs-fact rationale prefix is pinned literally',
  () => {
    const content = fs.readFileSync(PRUNE_SKILL, 'utf8');

    assert.ok(
      content.includes('PRUNE-CANDIDATE(<unit>): rule-vs-fact — '),
      'Expected literal "PRUNE-CANDIDATE(<unit>): rule-vs-fact — " in skills/prune/SKILL.md',
    );
  },
);

test(
  'Given no new token may be defined, when skills/ is scanned for candidate tokens, then PRUNE-CANDIDATE is the only *-CANDIDATE( form',
  () => {
    let result;
    try {
      result = execFileSync('grep', ['-rEn', '[A-Z-]+-CANDIDATE\\(', path.join(ROOT, 'skills')], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      // grep exits non-zero when no matches found — that's a legitimate (if surprising) outcome here.
      result = err.stdout ?? '';
    }
    const lines = result.split('\n').filter(Boolean);
    const tokenPattern = /([A-Z-]+-CANDIDATE)\(/;

    const offenders = lines.filter((line) => {
      const match = tokenPattern.exec(line);
      return match !== null && match[1] !== 'PRUNE-CANDIDATE';
    });

    assert.deepStrictEqual(offenders, [], `Expected only PRUNE-CANDIDATE( tokens under skills/, found: ${offenders.join(', ')}`);

    const content = fs.readFileSync(PRUNE_SKILL, 'utf8');
    assert.ok(
      content.includes('is defined **here only**'),
      'Expected "is defined **here only**" to survive in skills/prune/SKILL.md',
    );
  },
);

test(
  'Given the prune skill reads contracts/core.md as its fail-closed denylist, when core.md is read, then the repo-wide git-state line is present',
  () => {
    const content = fs.readFileSync(CORE_CONTRACT, 'utf8');

    assert.ok(
      content.includes('Never change repo-wide git state'),
      'Expected the repo-wide git-state line in contracts/core.md — Part 1 must land before Part 2',
    );
  },
);
