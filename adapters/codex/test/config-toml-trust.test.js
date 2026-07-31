import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toQuotedTomlKey, upsertTrustedHash } from '../src/config-toml-trust.js';

const CODEX_HOME_KEY = '/fixture/codex-home/config.toml:pre_tool_use:0:0';
const HASH = 'sha256:031fe4e9d67c31089132dd774df39307c554f5cf27089031a68c75233ef2ecf4';
const NEW_HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const UNRELATED_TABLE = '[other.table]\nfoo = "bar"\n';

function tableHeader(key = CODEX_HOME_KEY) {
  return `[hooks.state.${toQuotedTomlKey(key)}]`;
}

function assignmentLine(hash = HASH) {
  return `trusted_hash = ${toQuotedTomlKey(hash)}`;
}

// Matches every well-formed escape token our escaper can emit: doubled
// backslash, escaped quote, or a four-hex-digit control-character escape.
// Stripping every such token and checking what remains for a bare `"` proves
// the quoting invariant without inverting any escape back to its original
// character — that inversion is exactly the unescaper the plan says not to
// write.
const ESCAPE_SEQUENCE_PATTERN = /\\\\|\\"|\\u[0-9A-F]{4}/g;

function hasBareQuote(quotedValue) {
  const inner = quotedValue.slice(1, -1);
  return inner.replace(ESCAPE_SEQUENCE_PATTERN, '').includes('"');
}

describe('toQuotedTomlKey()', () => {
  const PLAIN_KEY = '/fixture/codex-home/config.toml:pre_tool_use:0:0';
  const PLAIN_EXPECTED = '"/fixture/codex-home/config.toml:pre_tool_use:0:0"';

  const QUOTE_KEY = '/fixture/codex-home"weird/config.toml:pre_tool_use:0:0';
  const QUOTE_EXPECTED = String.raw`"/fixture/codex-home\"weird/config.toml:pre_tool_use:0:0"`;

  const BACKSLASH_KEY = String.raw`/fixture/codex-home\weird/config.toml:pre_tool_use:0:0`;
  const BACKSLASH_EXPECTED = String.raw`"/fixture/codex-home\\weird/config.toml:pre_tool_use:0:0"`;

  const TAB_KEY = '/fixture/codex-home/\t/config.toml:pre_tool_use:0:0';
  const TAB_EXPECTED = '"/fixture/codex-home/\\u0009/config.toml:pre_tool_use:0:0"';

  const matrix = [
    ['the pinned key shape', PLAIN_KEY, PLAIN_EXPECTED],
    ['a key containing a double quote', QUOTE_KEY, QUOTE_EXPECTED],
    ['a key containing a backslash', BACKSLASH_KEY, BACKSLASH_EXPECTED],
    ['a key containing a control character (tab, U+0009)', TAB_KEY, TAB_EXPECTED],
  ];

  for (const [label, input, expected] of matrix) {
    it(`Given ${label}, when toQuotedTomlKey runs, then it emits the exact escaped and quoted string`, () => {
      const sut = toQuotedTomlKey;

      const result = sut(input);

      assert.equal(result, expected);
    });

    it(`Given ${label}, when toQuotedTomlKey runs, then the result opens and closes with a double quote and carries no unescaped double quote between them`, () => {
      const sut = toQuotedTomlKey;

      const result = sut(input);

      assert.ok(result.startsWith('"'));
      assert.ok(result.endsWith('"'));
      assert.equal(hasBareQuote(result), false);
    });
  }
});

describe('upsertTrustedHash()', () => {
  it('Given an empty input, when upsertTrustedHash runs, then it returns just the table block with no leading blank line', () => {
    const sut = upsertTrustedHash;

    const result = sut('', { key: CODEX_HOME_KEY, hash: HASH });

    assert.equal(result, `${tableHeader()}\n${assignmentLine()}\n`);
  });

  it('Given a whitespace-only input, when upsertTrustedHash runs, then it returns just the table block with no leading blank line', () => {
    const sut = upsertTrustedHash;

    const result = sut('   \n  \n', { key: CODEX_HOME_KEY, hash: HASH });

    assert.equal(result, `${tableHeader()}\n${assignmentLine()}\n`);
  });

  it('Given a file carrying only unrelated tables, when upsertTrustedHash runs, then every unrelated line survives verbatim and the new table is appended after exactly one blank line', () => {
    const sut = upsertTrustedHash;

    const result = sut(UNRELATED_TABLE, { key: CODEX_HOME_KEY, hash: HASH });

    assert.equal(result, `${UNRELATED_TABLE}\n${tableHeader()}\n${assignmentLine()}\n`);
  });

  it('Given a file already carrying the table with the same hash, when upsertTrustedHash runs, then the output is byte-identical to the input', () => {
    const sut = upsertTrustedHash;
    const once = sut(UNRELATED_TABLE, { key: CODEX_HOME_KEY, hash: HASH });

    const result = sut(once, { key: CODEX_HOME_KEY, hash: HASH });

    assert.equal(result, once);
  });

  it('Given a file carrying the table with a different hash, when upsertTrustedHash runs, then the value is replaced and exactly one table header remains', () => {
    const sut = upsertTrustedHash;
    const once = sut(UNRELATED_TABLE, { key: CODEX_HOME_KEY, hash: HASH });

    const result = sut(once, { key: CODEX_HOME_KEY, hash: NEW_HASH });

    assert.ok(result.includes(assignmentLine(NEW_HASH)));
    assert.ok(!result.includes(assignmentLine(HASH)));
    assert.equal(result.split(tableHeader()).length - 1, 1);
  });

  it('Given a file carrying the table with no trusted_hash key, when upsertTrustedHash runs, then the assignment is inserted immediately after the header', () => {
    const sut = upsertTrustedHash;
    const input = `${tableHeader()}\nenabled = true\n`;

    const result = sut(input, { key: CODEX_HOME_KEY, hash: HASH });

    assert.equal(result, `${tableHeader()}\n${assignmentLine()}\nenabled = true\n`);
  });

  it('Given a file whose table carries two trusted_hash assignments, when upsertTrustedHash runs, then it throws', () => {
    const sut = upsertTrustedHash;
    const input = `${tableHeader()}\ntrusted_hash = "a"\ntrusted_hash = "b"\n`;

    assert.throws(() => sut(input, { key: CODEX_HOME_KEY, hash: HASH }));
  });

  it('Given an input with no terminating newline, when upsertTrustedHash runs, then the appended block is separated by exactly one blank line and ends with a trailing newline', () => {
    const sut = upsertTrustedHash;
    const input = '[other.table]\nfoo = 1';

    const result = sut(input, { key: CODEX_HOME_KEY, hash: HASH });

    assert.equal(result, `[other.table]\nfoo = 1\n\n${tableHeader()}\n${assignmentLine()}\n`);
  });
});

describe('upsertTrustedHash() — idempotence', () => {
  const cases = [
    ['an empty input', () => ''],
    ['a whitespace-only input', () => '   \n'],
    ['unrelated tables only', () => UNRELATED_TABLE],
    ['an input with no terminating newline', () => '[other.table]\nfoo = 1'],
    ['a table with no trusted_hash key', () => `${tableHeader()}\nenabled = true\n`],
    [
      'a table already carrying the same hash',
      () => upsertTrustedHash(UNRELATED_TABLE, { key: CODEX_HOME_KEY, hash: HASH }),
    ],
    [
      'a table already carrying a different hash',
      () => upsertTrustedHash(UNRELATED_TABLE, { key: CODEX_HOME_KEY, hash: NEW_HASH }),
    ],
  ];

  for (const [label, buildInput] of cases) {
    it(`Given ${label}, when upsertTrustedHash is applied twice, then the second application is byte-identical to the first`, () => {
      const sut = upsertTrustedHash;
      const input = buildInput();

      const once = sut(input, { key: CODEX_HOME_KEY, hash: HASH });
      const twice = sut(once, { key: CODEX_HOME_KEY, hash: HASH });

      assert.equal(twice, once);
    });
  }
});
