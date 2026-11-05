'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceProse } = require('./helpers/region-slice');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = fs.readFileSync(path.join(ROOT, 'templates', 'pr-body.md'), 'utf8');
const DOCUMENTATION = fs.readFileSync(path.join(ROOT, 'skills', 'documentation', 'SKILL.md'), 'utf8');
const TRAILER_HEADING = /^### Provenance & verification/;
const PR_BODY_STEP = /^ {3}No findings/;
const MARKER = 'adopted-as-recommended';
const BASIS_RULE = 'listed as `ADR-NNN (<basis>)`, where `<basis>` is the basis named right after the marker\'s ` — `';

test('Given the PR-body template, when the Provenance & verification region is read, then the Decisions line splits ratified from adopted with a basis', () => {
  const sut = sliceProse(TEMPLATE, TRAILER_HEADING, TO_END);

  assert.ok(sut.includes('**Decisions:** <ratified: ADR-### …; adopted: ADR-### (ADR-NNN | DOCTRINE(D-n) | no trade-off) …; or none>'));
});

test('Given the documentation skill, when the PR-body step is read, then it derives the split from the adopted marker and its basis suffix', () => {
  const sut = sliceProse(DOCUMENTATION, PR_BODY_STEP, TO_END);

  assert.ok(sut.includes(MARKER));
  assert.ok(sut.includes(BASIS_RULE));
  assert.match(sut, /ratified/);
});
