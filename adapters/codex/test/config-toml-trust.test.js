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

describe('upsertTrustedHash() — a following table is a boundary', () => {
  const OTHER_HASH = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  // An indented table header is legal TOML, so a boundary rule that inspects the
  // raw line misses it and lets the target table's extent run into the NEXT
  // table — overwriting that table's trusted_hash and leaving the target table
  // with none, which is the guard-absent state behind a success message.
  const INDENTS = [
    ['flush-left', ''],
    ['indented', '  '],
  ];

  for (const [label, indent] of INDENTS) {
    const followingTable = `${indent}[other.table]\n${indent}trusted_hash = "${OTHER_HASH}"\n`;
    const input = `${tableHeader()}\nenabled = true\n\n${followingTable}`;

    it(`Given a target table followed by a ${label} table carrying its own trusted_hash, when upsertTrustedHash runs, then the assignment lands in the target table`, () => {
      const sut = upsertTrustedHash;

      const result = sut(input, { key: CODEX_HOME_KEY, hash: HASH });

      assert.ok(result.includes(`${tableHeader()}\n${assignmentLine()}\n`));
    });

    it(`Given a target table followed by a ${label} table carrying its own trusted_hash, when upsertTrustedHash runs, then that following table survives byte-identical`, () => {
      const sut = upsertTrustedHash;

      const result = sut(input, { key: CODEX_HOME_KEY, hash: HASH });

      assert.ok(result.includes(followingTable));
      assert.equal(result.split('trusted_hash').length - 1, 2);
    });
  }
});

describe('upsertTrustedHash() — only a table header ends a table', () => {
  // A boundary rule that fires on any line-initial `[` ends the target table at
  // an array continuation line, misses the trusted_hash below it, and inserts a
  // second one — a duplicate key, which is invalid TOML, so codex stops parsing
  // config.toml and the guard stops being registered while the tool reports
  // success. Only a header-SHAPED line may end a table.
  const NON_HEADER_LINES = [
    ['an array element on its own line', 'matchers = [\n["a"],\n]'],
    ['a closing bracket on its own line', 'matchers = [\n  "a"\n]'],
    // The commonest of the three, and the one a rule that merely looks for
    // bracket-shaped text anywhere in the line mistakes for a header.
    ['an inline array as its value', 'matchers = ["a"]'],
  ];

  for (const [label, value] of NON_HEADER_LINES) {
    const input = `${tableHeader()}\n${value}\ntrusted_hash = "${HASH}"\n`;

    it(`Given a target table carrying ${label}, when upsertTrustedHash runs, then the existing assignment is replaced rather than duplicated`, () => {
      const sut = upsertTrustedHash;

      const result = sut(input, { key: CODEX_HOME_KEY, hash: NEW_HASH });

      assert.equal(result.split('trusted_hash').length - 1, 1);
      assert.ok(result.includes(assignmentLine(NEW_HASH)));
    });
  }

  it('Given a following table header carrying a trailing comment, when upsertTrustedHash runs, then it still ends the target table there', () => {
    const sut = upsertTrustedHash;
    const following = '[other.table]  # kept by the operator\ntrusted_hash = "keep-me"\n';
    const input = `${tableHeader()}\nenabled = true\n\n${following}`;

    const result = sut(input, { key: CODEX_HOME_KEY, hash: HASH });

    assert.ok(result.includes(`${tableHeader()}\n${assignmentLine()}\n`));
    assert.ok(result.includes(following));
  });

  it('Given a following array-of-tables header, when upsertTrustedHash runs, then it still ends the target table there', () => {
    const sut = upsertTrustedHash;
    const following = '[[hooks.PreToolUse]]\ntrusted_hash = "keep-me"\n';
    const input = `${tableHeader()}\nenabled = true\n\n${following}`;

    const result = sut(input, { key: CODEX_HOME_KEY, hash: HASH });

    assert.ok(result.includes(`${tableHeader()}\n${assignmentLine()}\n`));
    assert.ok(result.includes(following));
  });
});

describe('upsertTrustedHash() — what counts as the table\'s own trusted_hash', () => {
  // TOML lets an operator indent a key and space the equals sign as they like,
  // and this file already accepts an indented table header. A spelling the
  // lookup misses does not read as "no key yet" harmlessly: a second
  // trusted_hash is inserted beside the first, a duplicate key is invalid TOML,
  // and codex then stops parsing config.toml — so the guard stops being
  // registered while this reports success.
  const SPELLINGS = [
    ['indented', `  trusted_hash = "${HASH}"`],
    ['written with no space around the equals sign', `trusted_hash="${HASH}"`],
    ['written with several spaces before the equals sign', `trusted_hash   = "${HASH}"`],
  ];

  for (const [label, existing] of SPELLINGS) {
    it(`Given a target table whose trusted_hash is ${label}, when upsertTrustedHash runs, then that assignment is replaced rather than a second one inserted`, () => {
      const sut = upsertTrustedHash;
      const input = `${tableHeader()}\n${existing}\n`;

      const result = sut(input, { key: CODEX_HOME_KEY, hash: NEW_HASH });

      assert.equal(result.split('trusted_hash').length - 1, 1);
      assert.ok(result.includes(assignmentLine(NEW_HASH)));
    });
  }

  // A commented-out attempt is text, not an assignment. Counting it as one makes
  // the writer see two keys where the operator wrote one and refuse a config
  // that is perfectly valid.
  it('Given a target table carrying a commented-out trusted_hash above the real one, when upsertTrustedHash runs, then the comment survives and only the assignment is replaced', () => {
    const sut = upsertTrustedHash;
    const comment = '# trusted_hash = "an earlier attempt, kept by the operator"';
    const input = `${tableHeader()}\n${comment}\ntrusted_hash = "${HASH}"\n`;

    const result = sut(input, { key: CODEX_HOME_KEY, hash: NEW_HASH });

    assert.ok(result.includes(comment));
    assert.ok(result.includes(assignmentLine(NEW_HASH)));
  });
});

describe('upsertTrustedHash() — the target table\'s own header may be indented', () => {
  // An indented header is legal TOML. Failing to recognise it appends a SECOND
  // [hooks.state.<key>] table, and a duplicate table is invalid TOML — the same
  // guard-absent state behind a success message that a duplicate key produces.
  it('Given the target table under an indented header, when upsertTrustedHash runs, then that table is edited rather than a second one appended', () => {
    const sut = upsertTrustedHash;
    const input = `  ${tableHeader()}\ntrusted_hash = "${HASH}"\n`;

    const result = sut(input, { key: CODEX_HOME_KEY, hash: NEW_HASH });

    assert.equal(result.split(tableHeader()).length - 1, 1);
    assert.ok(result.includes(assignmentLine(NEW_HASH)));
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
