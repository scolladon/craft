'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PRUNE_SKILL = path.join(ROOT, 'skills', 'prune', 'SKILL.md');

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

    // Positively pin that the scan actually found the token it is policing.
    // With zero matches this test would otherwise pass for the wrong reason.
    assert.ok(
      lines.some((line) => line.includes('PRUNE-CANDIDATE(')),
      'the scan found no PRUNE-CANDIDATE( line at all — the scan itself is broken',
    );

    // Exercise the classifier against a synthetic offender, so a broken regex
    // cannot hide behind a clean tree.
    const synthetic = 'skills/x/SKILL.md:1:FIX-CANDIDATE(y): z';
    const syntheticMatch = synthetic.match(tokenPattern);
    assert.ok(syntheticMatch && syntheticMatch[1] !== 'PRUNE-CANDIDATE',
      'the classifier must flag a non-PRUNE candidate token');

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
  'Given the rule-vs-fact lens proposes against a denylist, when the prune skill is read, then it names contracts/core.md as that denylist source',
  () => {
    const content = fs.readFileSync(PRUNE_SKILL, 'utf8');

    assert.ok(
      content.includes('contracts/core.md'),
      'the prune skill must name contracts/core.md as its denylist source',
    );
    assert.match(
      content,
      /fail[- ]closed/iu,
      'the denylist read must be described as fail-closed',
    );
  },
);
