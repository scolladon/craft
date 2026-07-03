import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractFrontmatter, parseManifestContent } from '../src/frontmatter.js';

test('Given content with a frontmatter block and a body, when extractFrontmatter runs, then it returns only the block between the fences', () => {
  const sut = extractFrontmatter;
  const content = '---\npipeline:\n  profile: lean\n---\n\n# body\nprose\n';

  const result = sut(content);

  assert.equal(result, 'pipeline:\n  profile: lean');
});

test('Given fence-less content, when extractFrontmatter runs, then it returns null', () => {
  const sut = extractFrontmatter;
  const content = 'pipeline:\n  profile: solo\n';

  const result = sut(content);

  assert.equal(result, null);
});

test('Given an empty frontmatter block (immediate closing fence), when extractFrontmatter runs, then it returns null', () => {
  const sut = extractFrontmatter;
  const content = '---\n---\n\n# body\n';

  const result = sut(content);

  assert.equal(result, null);
});

test('Given content with a second fence inside the body, when extractFrontmatter runs, then only the first block is returned', () => {
  const sut = extractFrontmatter;
  const content = '---\nexecution: inline\n---\n\nbody with a stray\n---\nfence\n';

  const result = sut(content);

  assert.equal(result, 'execution: inline');
});

test('Given CRLF line endings on the fences, when extractFrontmatter runs, then the block is still extracted', () => {
  const sut = extractFrontmatter;
  const content = '---\r\npipeline:\r\n  profile: lean\r\n---\r\n\r\n# body\r\n';

  const result = sut(content);

  assert.equal(result, 'pipeline:\n  profile: lean');
});

test('Given a fence with trailing spaces, when extractFrontmatter runs, then it is still treated as a fence', () => {
  const sut = extractFrontmatter;
  const content = '---  \nexecution: inline\n--- \n\n# body\n';

  const result = sut(content);

  assert.equal(result, 'execution: inline');
});

test('Given an opening fence with no closing fence, when extractFrontmatter runs, then it returns the collected lines (accepted, malformed-tolerant)', () => {
  const sut = extractFrontmatter;
  const content = '---\nexecution: inline\nstill collecting';

  const result = sut(content);

  assert.equal(result, 'execution: inline\nstill collecting');
});

// ─── parseManifestContent: fenced vs fence-less vs empty ──────────────────────

test('Given a fenced manifest with a markdown body, when parseManifestContent runs, then only the frontmatter object is returned', () => {
  const sut = parseManifestContent;
  const content = '---\npipeline:\n  profile: lean\n---\n\n# Rationale prose\n';

  const result = sut(content);

  assert.deepEqual(result, { pipeline: { profile: 'lean' } });
});

test('Given a fenced manifest whose body contains YAML-looking text, when parseManifestContent runs, then the body is excluded and the frontmatter wins', () => {
  const sut = parseManifestContent;
  const content = '---\npipeline:\n  profile: lean\n---\n\npipeline:\n  profile: solo\n';

  const result = sut(content);

  assert.deepEqual(result, { pipeline: { profile: 'lean' } });
});

test('Given a fence-less pure-YAML manifest, when parseManifestContent runs, then the whole content is parsed', () => {
  const sut = parseManifestContent;
  const content = 'pipeline:\n  profile: solo\n';

  const result = sut(content);

  assert.deepEqual(result, { pipeline: { profile: 'solo' } });
});

test('Given a fenced manifest with an empty frontmatter block, when parseManifestContent runs, then it returns null (defaults, never the prose body)', () => {
  const sut = parseManifestContent;
  const content = '---\n---\n\n# just rationale, no config\n';

  const result = sut(content);

  assert.equal(result, null);
});

test('Given content whose first --- fence appears only mid-file after prose, when extractFrontmatter runs, then it returns null instead of treating horizontal rules as a block', () => {
  const sut = extractFrontmatter;
  const content = '# Title\n\nintro prose\n\n---\n\n## Section\n- item one\n\n---\n\nmore prose\n';

  const result = sut(content);

  assert.equal(result, null);
});
