import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDod, validateDodCriteria, assertDodCriteria } from '../src/dod.js';

// parseDod

test('Given free-text content with no frontmatter, when parseDod runs, then it returns null', () => {
  const sut = parseDod;
  const content = '# DoD\n\n- criterion one\n- criterion two\n';

  assert.equal(sut(content), null);
});

test('Given structured frontmatter with N criteria, when parseDod runs, then it returns {criteria} of length N', () => {
  const sut = parseDod;
  const content = [
    '---',
    'criteria:',
    '  - id: c1',
    '    kind: judgment',
    '    text: passes',
    '  - id: c2',
    '    kind: auto',
    '    text: gate green',
    '    assert:',
    '      gate: validation',
    '---',
    '',
  ].join('\n');

  const result = sut(content);

  assert.ok(result !== null);
  assert.equal(result.criteria.length, 2);
});

test('Given a present frontmatter block with malformed YAML, when parseDod runs, then it throws (fails loud, not silent free-text)', () => {
  const sut = parseDod;
  const content = '---\ncriteria: [\n  broken: yaml: {{{\n---\n';

  assert.throws(() => sut(content), /malformed YAML frontmatter/);
});

test('Given frontmatter without a criteria key, when parseDod runs, then it returns null', () => {
  const sut = parseDod;
  const content = '---\ntitle: my dod\nnotes: some notes\n---\n';

  assert.equal(sut(content), null);
});

test('Given frontmatter with an empty criteria list, when parseDod runs, then it returns {criteria:[]}', () => {
  const sut = parseDod;
  const content = '---\ncriteria: []\n---\n';

  const result = sut(content);

  assert.ok(result !== null);
  assert.deepEqual(result.criteria, []);
});

test('Given a structured criterion with id/kind/text/assert fields, when parseDod runs, then those fields are preserved on the criterion', () => {
  const sut = parseDod;
  const content = [
    '---',
    'criteria:',
    '  - id: gate-check',
    '    kind: auto',
    '    text: validation gate must be green',
    '    assert:',
    '      gate: validation',
    '---',
    '',
  ].join('\n');

  const result = sut(content);

  assert.ok(result !== null);
  const crit = result.criteria[0];
  assert.equal(crit.id, 'gate-check');
  assert.equal(crit.kind, 'auto');
  assert.equal(crit.text, 'validation gate must be green');
  assert.deepEqual(crit.assert, { gate: 'validation' });
});

// validateDodCriteria

test('Given an auto criterion with a string assert.gate, when validateDodCriteria runs, then it returns no errors', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'gate-check', kind: 'auto', text: 'gate green', assert: { gate: 'validation' } }];

  assert.deepEqual(sut(criteria), []);
});

test('Given a judgment criterion with id and kind, when validateDodCriteria runs, then it returns no errors', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'human-check', kind: 'judgment', text: 'reviewed by human' }];

  assert.deepEqual(sut(criteria), []);
});

test('Given a criterion with no id, when validateDodCriteria runs, then it returns an error referencing the full index-qualified id path', () => {
  const sut = validateDodCriteria;
  const criteria = [{ kind: 'judgment', text: 'no id' }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes('dod.criteria[0].id must be a non-empty string')));
});

test('Given a criterion with an invalid kind value, when validateDodCriteria runs, then it returns an error referencing kind', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'bad-kind', kind: 'execute', text: 'bad' }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes('kind')));
});

test('Given an auto criterion without an assert object, when validateDodCriteria runs, then it returns an error referencing assert', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'no-assert', kind: 'auto', text: 'no assert' }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes('assert')));
});

test('Given an auto criterion with a non-string assert.gate, when validateDodCriteria runs, then it returns an error referencing gate', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'bad-gate', kind: 'auto', text: 'bad gate', assert: { gate: 42 } }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes('gate')));
});

test('Given a non-array criteria value, when validateDodCriteria runs, then it returns an error referencing array', () => {
  const sut = validateDodCriteria;

  const errors = sut('not-an-array');

  assert.ok(errors.length > 0);
  assert.ok(errors.some(e => e.includes('array')));
});

// assertDodCriteria

test('Given an auto criterion with gate-green evidence and a stray command field, when assertDodCriteria runs, then it returns met and the command field is not invoked', () => {
  const sut = assertDodCriteria;
  let commandInvoked = false;
  const criteria = [{
    id: 'gate-check',
    kind: 'auto',
    text: 'gate green',
    assert: { gate: 'validation' },
    command: () => { commandInvoked = true; return true; },
    run: () => { commandInvoked = true; return true; },
  }];
  const evidence = { gateGreen: () => true, fileExists: () => false };

  const result = sut(criteria, evidence);

  assert.deepEqual(result, ['met']);
  assert.equal(commandInvoked, false);
});

test('Given an auto criterion with gate evidence returning false, when assertDodCriteria runs, then it returns unmet', () => {
  const sut = assertDodCriteria;
  const criteria = [{ id: 'gate-check', kind: 'auto', text: 'gate green', assert: { gate: 'validation' } }];
  const evidence = { gateGreen: () => false, fileExists: () => false };

  assert.deepEqual(sut(criteria, evidence), ['unmet']);
});

test('Given an auto criterion with an unknown phase id, when assertDodCriteria runs, then gateGreen returning undefined is treated as unmet', () => {
  const sut = assertDodCriteria;
  const criteria = [{ id: 'gate-check', kind: 'auto', text: 'gate green', assert: { gate: 'nonexistent-phase' } }];
  const evidence = { gateGreen: () => undefined, fileExists: () => false };

  assert.deepEqual(sut(criteria, evidence), ['unmet']);
});

test('Given an auto criterion with file-exists assert, when assertDodCriteria runs, then outcome reflects the fileExists predicate', () => {
  const sut = assertDodCriteria;
  const criteria = [{ id: 'file-check', kind: 'auto', text: 'file present', assert: { 'file-exists': 'docs/DESIGN.md' } }];

  assert.deepEqual(sut(criteria, { gateGreen: () => undefined, fileExists: () => true }), ['met']);
  assert.deepEqual(sut(criteria, { gateGreen: () => undefined, fileExists: () => false }), ['unmet']);
});

test('Given an auto criterion carrying both gate and file-exists, when validateDodCriteria runs, then it returns an error rejecting the ambiguous pair', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'ambiguous', kind: 'auto', text: 'both keys', assert: { gate: 'review', 'file-exists': 'docs/DESIGN.md' } }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes("must not have both 'gate' and 'file-exists'")));
});

test('Given an auto criterion with a valid string file-exists assert, when validateDodCriteria runs, then it returns no errors', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'file-check', kind: 'auto', assert: { 'file-exists': 'docs/DESIGN.md' } }];

  assert.deepEqual(sut(criteria), []);
});

test('Given an auto criterion with a file-exists assert, when assertDodCriteria runs, then evidence.fileExists receives the exact configured path', () => {
  const sut = assertDodCriteria;
  const receivedPaths = [];
  const criteria = [{ id: 'file-check', kind: 'auto', assert: { 'file-exists': 'docs/DESIGN.md' } }];
  const evidence = {
    gateGreen: () => undefined,
    fileExists: (p) => { receivedPaths.push(p); return true; },
  };

  const result = sut(criteria, evidence);

  assert.deepEqual(result, ['met']);
  assert.deepEqual(receivedPaths, ['docs/DESIGN.md']);
});

test('Given a judgment criterion, when assertDodCriteria runs, then it returns judgment without consulting evidence', () => {
  const sut = assertDodCriteria;
  const criteria = [{ id: 'human-check', kind: 'judgment', text: 'reviewed by human' }];
  const evidence = { gateGreen: () => false, fileExists: () => false };

  assert.deepEqual(sut(criteria, evidence), ['judgment']);
});

test('Given YAML frontmatter that parses to null, when parseDod runs, then it returns null', () => {
  const sut = parseDod;
  const content = '---\nnull\n---\n';

  assert.equal(sut(content), null);
});

test('Given a criteria array with a null element, when validateDodCriteria runs, then it returns an error that the element must be an object', () => {
  const sut = validateDodCriteria;

  const errors = sut([null]);

  assert.ok(errors.some(e => e.includes('must be an object')));
});

test('Given a criteria array with a number element, when validateDodCriteria runs, then it returns an error that the element must be an object', () => {
  const sut = validateDodCriteria;

  const errors = sut([42]);

  assert.ok(errors.some(e => e.includes('must be an object')));
});

test('Given a criterion with a whitespace-only id, when validateDodCriteria runs, then it returns an error for the id', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: '   ', kind: 'judgment', text: 'spaces only' }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes('.id must be a non-empty string')));
});

test('Given an auto criterion with a non-object assert value, when validateDodCriteria runs, then it returns an error referencing the assert object requirement', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'bad-assert', kind: 'auto', assert: 42 }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes("'assert' object")));
});

test('Given an auto criterion with an assert object lacking both gate and file-exists, when validateDodCriteria runs, then it returns an error for the missing key', () => {
  const sut = validateDodCriteria;
  const criteria = [{ id: 'empty-assert', kind: 'auto', assert: { other: 'value' } }];

  const errors = sut(criteria);

  assert.ok(errors.some(e => e.includes("'gate' or 'file-exists'")));
});

test('Given an auto criterion with no assert property, when assertDodCriteria runs, then it returns unmet', () => {
  const sut = assertDodCriteria;
  const criteria = [{ id: 'no-assert', kind: 'auto', text: 'no assert' }];
  const evidence = { gateGreen: () => true, fileExists: () => true };

  assert.deepEqual(sut(criteria, evidence), ['unmet']);
});

test('Given an auto criterion with an assert object carrying neither gate nor file-exists, when assertDodCriteria runs, then it returns unmet', () => {
  const sut = assertDodCriteria;
  const criteria = [{ id: 'unknown-assert', kind: 'auto', assert: { other: 'value' } }];
  const evidence = { gateGreen: () => true, fileExists: () => true };

  assert.deepEqual(sut(criteria, evidence), ['unmet']);
});
