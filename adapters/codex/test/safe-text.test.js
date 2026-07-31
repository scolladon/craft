import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeControlChars, toDisplayText } from '../src/safe-text.js';

describe('escapeControlChars()', () => {
  const ESCAPES = [
    ['a line feed', 'a\nb', 'a\\u000Ab'],
    ['a carriage return', 'a\rb', 'a\\u000Db'],
    ['a tab', 'a\tb', 'a\\u0009b'],
    ['a NUL', 'a\u0000b', 'a\\u0000b'],
    // The last code point of the control range, and the only one that decides
    // whether that bound is inclusive — TOML forbids it unescaped like every
    // other control character, so the range may not stop one short of it.
    ['a unit separator (U+001F)', 'a\u001Fb', 'a\\u001Fb'],
    ['DEL', 'a\u007Fb', 'a\\u007Fb'],
    // Invisible on every sink this renders to, and a bidi override reorders the
    // visible text around it — so a command shown to a human can read as something
    // other than what it is while its bytes stay untouched. The echoed value IS the
    // safeguard here, so it may not lie about itself.
    ['a zero-width space (U+200B)', 'a\u200Bb', 'a\\u200Bb'],
    ['a zero-width joiner (U+200D)', 'a\u200Db', 'a\\u200Db'],
    ['a right-to-left mark (U+200F)', 'a\u200Fb', 'a\\u200Fb'],
    ['a left-to-right embedding (U+202A)', 'a\u202Ab', 'a\\u202Ab'],
    ['a right-to-left override (U+202E)', 'a\u202Eb', 'a\\u202Eb'],
    ['a left-to-right isolate (U+2066)', 'a\u2066b', 'a\\u2066b'],
    ['a pop directional isolate (U+2069)', 'a\u2069b', 'a\\u2069b'],
    // The bidi control that sits nowhere near the others: leaving it out escapes
    // eight of the nine and calls the class covered.
    ['an Arabic letter mark (U+061C)', 'a\u061Cb', 'a\\u061Cb'],
    // Invisible without being bidi, and each one legal in a TOML basic string, so
    // an unescaped one reaches both sinks and renders as nothing in each.
    ['a soft hyphen (U+00AD)', 'a\u00ADb', 'a\\u00ADb'],
    ['a word joiner (U+2060)', 'a\u2060b', 'a\\u2060b'],
    ['an invisible plus (U+2064)', 'a\u2064b', 'a\\u2064b'],
    ['an inhibit symmetric swapping mark (U+206A)', 'a\u206Ab', 'a\\u206Ab'],
    ['a nominal digit shapes mark (U+206F)', 'a\u206Fb', 'a\\u206Fb'],
    ['a zero-width no-break space (U+FEFF)', 'a\uFEFFb', 'a\\uFEFFb'],
  ];

  for (const [label, input, expected] of ESCAPES) {
    it(`Given a text carrying ${label}, when escapeControlChars runs, then that character is replaced by its escape`, () => {
      const sut = escapeControlChars;

      const result = sut(input);

      assert.equal(result, expected);
    });
  }

  // The characters immediately outside each escaped range. Without them a range
  // could be widened to swallow ordinary text, and a value rendered as escapes is
  // one the operator can no longer recognise.
  const UNTOUCHED = [
    ['an Arabic semicolon (U+061B)', 'a\u061Bb'],
    ['a not sign (U+00AC)', 'a\u00ACb'],
    ['a registered sign (U+00AE)', 'a\u00AEb'],
    ['a hair space (U+200A)', 'a\u200Ab'],
    ['a line separator (U+2028)', 'a\u2028b'],
    ['a medium mathematical space (U+205F)', 'a\u205Fb'],
    ['a superscript zero (U+2070)', 'a\u2070b'],
    ['a fullwidth exclamation mark (U+FF01)', 'a\uFF01b'],
  ];

  for (const [label, input] of UNTOUCHED) {
    it(`Given a text carrying ${label}, when escapeControlChars runs, then it is returned unchanged`, () => {
      const sut = escapeControlChars;

      const result = sut(input);

      assert.equal(result, input);
    });
  }

  it('Given a text carrying no control character, when escapeControlChars runs, then it is returned unchanged', () => {
    const sut = escapeControlChars;

    const result = sut('/Users/someone/.codex/config.toml');

    assert.equal(result, '/Users/someone/.codex/config.toml');
  });
});

describe('toDisplayText()', () => {
  // Every value this renders arrives from another process over JSON-RPC, so a
  // non-string is possible however the protocol types it — and a value that
  // reached a stream unrendered would be the injection this exists to stop.
  const COERCIONS = [
    ['a number', 30, '30'],
    ['undefined', undefined, 'undefined'],
    ['null', null, 'null'],
  ];

  for (const [label, input, expected] of COERCIONS) {
    it(`Given ${label}, when toDisplayText runs, then it renders as text`, () => {
      const sut = toDisplayText;

      const result = sut(input);

      assert.equal(result, expected);
    });
  }

  it('Given a string carrying a line feed, when toDisplayText runs, then the result occupies a single line', () => {
    const sut = toDisplayText;

    const result = sut('first\nsecond');

    assert.equal(result.includes('\n'), false);
  });
});
