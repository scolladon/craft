import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PATCH_PATH_DIRECTIVES, extractPatchPaths } from '../src/apply-patch-paths.js';

const SINGLE_ADD = ['*** Begin Patch', '*** Add File: src/a.js', '+export const a = 1;', '*** End Patch'].join(
  '\n',
);

const MULTI_HUNK_ALL_IN = [
  '*** Begin Patch',
  '*** Update File: src/a.js',
  '@@',
  '-old',
  '+new',
  '*** Add File: src/b.js',
  '+export const b = 2;',
  '*** End Patch',
].join('\n');

const MULTI_HUNK_DECOY = [
  '*** Begin Patch',
  '*** Update File: src/a.js',
  '@@',
  '-old',
  '+new',
  '*** Add File: ../../../etc/evil',
  '+malicious content',
  '*** End Patch',
].join('\n');

const RENAME = [
  '*** Begin Patch',
  '*** Update File: src/a.js',
  '*** Move to: src/b.js',
  '@@',
  '-old',
  '+new',
  '*** End Patch',
].join('\n');

const RENAME_ESCAPE = [
  '*** Begin Patch',
  '*** Update File: src/a.js',
  '*** Move to: ../../outside.js',
  '@@',
  '-old',
  '+new',
  '*** End Patch',
].join('\n');

const DELETE_ESCAPE = ['*** Begin Patch', '*** Delete File: /etc/passwd', '*** End Patch'].join('\n');

const EMPTY_PATH = ['*** Begin Patch', '*** Add File:', '*** End Patch'].join('\n');

const NO_DIRECTIVE = ['*** Begin Patch', '*** End Patch'].join('\n');

const MANY_HUNKS_MIXED = [
  '*** Begin Patch',
  '*** Add File: src/a.js',
  '+line',
  '*** Update File: src/b.js',
  '@@',
  '-old',
  '+new',
  '*** Delete File: src/c.js',
  '*** Update File: src/d.js',
  '*** Move to: src/e.js',
  '@@',
  '-old',
  '+new',
  '*** End Patch',
].join('\n');

const WHITESPACE_IRREGULAR = ['*** Begin Patch', '   *** Add File:   src/a.js   ', '*** End Patch'].join('\n');

describe('extractPatchPaths() — single hunk', () => {
  it('Given a single-hunk add patch, when extractPatchPaths runs, then it returns the one named path', () => {
    const sut = extractPatchPaths;

    const result = sut(SINGLE_ADD);

    assert.deepEqual(result, ['src/a.js']);
  });
});

describe('extractPatchPaths() — multi-hunk decoy', () => {
  it('Given a two-hunk patch whose first hunk is in-tree and whose second names an out-of-tree path, when extractPatchPaths runs, then BOTH paths are returned', () => {
    const sut = extractPatchPaths;

    const result = sut(MULTI_HUNK_DECOY);

    assert.equal(result.length, 2);
    assert.ok(result.includes('../../../etc/evil'));
  });

  it('Given a two-hunk patch with both files in-tree, when extractPatchPaths runs, then both paths are returned', () => {
    const sut = extractPatchPaths;

    const result = sut(MULTI_HUNK_ALL_IN);

    assert.deepEqual(result, ['src/a.js', 'src/b.js']);
  });
});

describe('extractPatchPaths() — rename', () => {
  it('Given a rename patch, when extractPatchPaths runs, then both the source and the *** Move to: destination are returned', () => {
    const sut = extractPatchPaths;

    const result = sut(RENAME);

    assert.deepEqual(result, ['src/a.js', 'src/b.js']);
  });

  it('Given a rename patch whose destination escapes the tree, when extractPatchPaths runs, then the escaping destination is among the returned paths', () => {
    const sut = extractPatchPaths;

    const result = sut(RENAME_ESCAPE);

    assert.ok(result.includes('../../outside.js'));
  });
});

describe('extractPatchPaths() — delete', () => {
  it('Given a delete-only patch naming an absolute path, when extractPatchPaths runs, then that path is returned', () => {
    const sut = extractPatchPaths;

    const result = sut(DELETE_ESCAPE);

    assert.deepEqual(result, ['/etc/passwd']);
  });
});

describe('extractPatchPaths() — empty path', () => {
  it('Given a patch whose directive carries no path, when extractPatchPaths runs, then an empty string is returned in that position rather than the entry being dropped', () => {
    const sut = extractPatchPaths;

    const result = sut(EMPTY_PATH);

    assert.ok(result.includes(''));
    assert.equal(result.length, 1);
  });
});

describe('extractPatchPaths() — no directive', () => {
  it('Given a patch envelope with no path directive at all, when extractPatchPaths runs, then an empty array is returned', () => {
    const sut = extractPatchPaths;

    const result = sut(NO_DIRECTIVE);

    assert.deepEqual(result, []);
  });
});

describe('extractPatchPaths() — document order across many hunks', () => {
  it('Given a patch with many hunks mixing all four directives, when extractPatchPaths runs, then every path is returned in document order', () => {
    const sut = extractPatchPaths;

    const result = sut(MANY_HUNKS_MIXED);

    assert.deepEqual(result, ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js', 'src/e.js']);
  });
});

describe('extractPatchPaths() — non-string input', () => {
  const cases = [
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a plain object', {}],
  ];

  for (const [label, input] of cases) {
    it(`Given ${label} as input, when extractPatchPaths runs, then it returns an empty array without throwing`, () => {
      const sut = extractPatchPaths;

      const result = sut(input);

      assert.deepEqual(result, []);
    });
  }
});

describe('extractPatchPaths() — irregular whitespace', () => {
  it('Given directive text with irregular surrounding whitespace, when extractPatchPaths runs, then the path is returned trimmed', () => {
    const sut = extractPatchPaths;

    const result = sut(WHITESPACE_IRREGULAR);

    assert.deepEqual(result, ['src/a.js']);
  });
});

describe('PATCH_PATH_DIRECTIVES — immutability', () => {
  it('Given PATCH_PATH_DIRECTIVES, when a caller attempts to mutate it, then the value is unchanged', () => {
    const sut = PATCH_PATH_DIRECTIVES;
    const before = sut[0];

    assert.throws(() => {
      sut[0] = 'mutated';
    }, TypeError);
    assert.equal(sut[0], before);
  });
});
