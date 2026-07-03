import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSubjects } from '../src/intention-subjects.js';

test('Given frontmatter with a valid subjects list, when parseSubjects runs, then it returns the list', () => {
  const sut = parseSubjects;
  const content = [
    '---',
    "subjects: ['engine/src/observability/**','docs/adapters/telemetry.md']",
    '---',
    '',
    '# Telemetry adapter spec',
    '',
  ].join('\n');

  const result = sut(content);

  assert.deepEqual(result, ['engine/src/observability/**', 'docs/adapters/telemetry.md']);
});

test('Given a mid-file `---` markdown horizontal rule with no line-1 frontmatter, when parseSubjects runs, then it returns null (the rule is not treated as a fence)', () => {
  const sut = parseSubjects;
  const content = '# Page title\n\nintro prose\n\n---\n\nsubjects: [\'engine/src/**\']\n';

  const result = sut(content);

  assert.equal(result, null);
});

test('Given content with no frontmatter block at all, when parseSubjects runs, then it returns null (advisory skip)', () => {
  const sut = parseSubjects;
  const content = '# Page title\n\nno frontmatter here\n';

  const result = sut(content);

  assert.equal(result, null);
});

test('Given a frontmatter block present without a subjects key, when parseSubjects runs, then it returns null (skip)', () => {
  const sut = parseSubjects;
  const content = '---\nname: foo\n---\n\n# Page title\n';

  const result = sut(content);

  assert.equal(result, null);
});

test('Given a frontmatter block that opens but mis-types its YAML, when parseSubjects runs, then it throws (fails loud, not silent skip)', () => {
  const sut = parseSubjects;
  const content = '---\nsubjects: [unclosed\n---\n\n# Page title\n';

  assert.throws(() => sut(content), /intention: malformed YAML frontmatter/);
});

test('Given a frontmatter block whose YAML body is the bare `null` scalar, when parseSubjects runs, then it returns null (not an object, so no subjects, and no crash on the property check)', () => {
  const sut = parseSubjects;
  const content = '---\nnull\n---\n\n# Page title\n';

  const result = sut(content);

  assert.equal(result, null);
});

test('Given a CRLF frontmatter block with a valid subjects list, when parseSubjects runs, then it returns the list', () => {
  const sut = parseSubjects;
  const content = "---\r\nsubjects: ['engine/src/observability/**']\r\n---\r\n\r\n# Telemetry adapter spec\r\n";

  const result = sut(content);

  assert.deepEqual(result, ['engine/src/observability/**']);
});
