'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONTRIBUTING = path.join(ROOT, 'CONTRIBUTING.md');
const SECURITY = path.join(ROOT, 'SECURITY.md');
const README = path.join(ROOT, 'README.md');
const SECURITY_FORM = path.join(ROOT, '.github', 'ISSUE_TEMPLATE', 'security-contact.yml');
const SECURITY_SURFACE = 'SECURITY.md';
const REPORTING_HEADING = '## Reporting a vulnerability';
const NO_DETAILS_RULE = 'Do not include vulnerability details';
const FORM_LINK = 'issues/new?template=security-contact.yml';
const CONTRIBUTOR_DOCS_LINK = '](docs/contributing/README.md)';
const RELEASING_LINK = '](docs/contributing/releasing.md)';
const LOCAL_GATE = 'bash scripts/ci.sh';
const README_ENTRY_POINT = '[CONTRIBUTING.md](CONTRIBUTING.md)';
const EVAL_COMMAND = /claude\s+plugin\s+eval/;

const read = file => fs.readFileSync(file, 'utf8');

function sectionAfter(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return null;
  const body = text.slice(start + heading.length);
  const next = body.search(/^## /m);
  return next === -1 ? body : body.slice(0, next);
}

function securityPolicyViolations(securityText) {
  const section = sectionAfter(securityText, REPORTING_HEADING);
  if (section === null) return [`${SECURITY_SURFACE}: missing "${REPORTING_HEADING}"`];
  const violations = [];
  const firstLine = section.split('\n').find(line => line.trim() !== '') || '';
  if (!firstLine.includes(NO_DETAILS_RULE)) {
    violations.push(`${SECURITY_SURFACE}: the no-details rule must be the first line of the reporting section`);
  }
  if (!section.includes(FORM_LINK)) {
    violations.push(`${SECURITY_SURFACE}: the reporting section must link the security contact form`);
  }
  return violations;
}

test('Given CONTRIBUTING.md, when read, then it routes to the contributor docs and the release procedure, names the local gate and quotes no eval command', () => {
  const sut = read(CONTRIBUTING);

  assert.ok(sut.includes(CONTRIBUTOR_DOCS_LINK));
  assert.ok(sut.includes(LOCAL_GATE));
  assert.ok(sut.includes(RELEASING_LINK));
  assert.doesNotMatch(sut, EVAL_COMMAND);
});

test('Given README.md, when read, then its contributor entry point links CONTRIBUTING.md', () => {
  const sut = read(README);

  assert.ok(sut.includes(README_ENTRY_POINT));
});

test('Given SECURITY.md, when its reporting section is read, then the no-details rule comes first and the section links the security contact form, which exists', () => {
  const sut = securityPolicyViolations(read(SECURITY));

  assert.deepStrictEqual(sut, []);
  assert.ok(fs.existsSync(SECURITY_FORM));
});

test('Given a reporting section with the rule below the numbered steps, when validated, then SECURITY.md is named', () => {
  const text = `${REPORTING_HEADING}\n\n1. Open ${FORM_LINK}\n\n**${NO_DETAILS_RULE}.**\n`;

  const sut = securityPolicyViolations(text);

  assert.strictEqual(sut.length, 1);
  assert.match(sut[0], /^SECURITY\.md: /);
});

test('Given a reporting section without the form link, when validated, then SECURITY.md is named', () => {
  const text = `${REPORTING_HEADING}\n\n**${NO_DETAILS_RULE}.**\n`;

  const sut = securityPolicyViolations(text);

  assert.strictEqual(sut.length, 1);
  assert.match(sut[0], /^SECURITY\.md: /);
});

test('Given a policy without a reporting section, when validated, then SECURITY.md is named', () => {
  const sut = securityPolicyViolations('# Security policy\n');

  assert.strictEqual(sut.length, 1);
  assert.match(sut[0], /^SECURITY\.md: /);
});
