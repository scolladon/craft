'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GITIGNORE = path.join(ROOT, '.gitignore');
const STORE_PATH = path.join(ROOT, '.claude/craft-memory.md');

function importMemoryModule() {
  const { pathToFileURL } = require('node:url');
  return import(pathToFileURL(path.join(ROOT, 'engine/src/observability/memory.js')).href);
}

function grepQX(pattern, filePath) {
  try {
    execFileSync('grep', ['-qx', pattern, filePath], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function grepRE(pattern, ...filePaths) {
  try {
    execFileSync('grep', ['-rE', pattern, ...filePaths], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test(
  'Given .gitignore controls store committability, when craft-memory.md re-include line is checked, then it is present',
  () => {
    assert.ok(
      grepQX('!.claude/craft-memory.md', GITIGNORE),
      '.gitignore should contain "!.claude/craft-memory.md"',
    );
  },
);

test(
  'Given .gitignore controls metrics committability, when craft-metrics.md re-include line is checked, then it is present',
  () => {
    assert.ok(
      grepQX('!.claude/craft-metrics.md', GITIGNORE),
      '.gitignore should contain "!.claude/craft-metrics.md"',
    );
  },
);

test(
  'Given .gitignore uses dir re-include for file re-includes to take effect, when .claude/ dir re-include line is checked, then it is present',
  () => {
    assert.ok(
      grepQX('!.claude/', GITIGNORE),
      '.gitignore should contain "!.claude/"',
    );
  },
);

test(
  'Given the ledger is run-local, when git is asked, then the ledger path is actually ignored',
  () => {
    // Positive check, not just the absence of a re-include: this also fails if the
    // `.claude/*` rule that does the ignoring is ever lost.
    let result = 0;
    try {
      execFileSync('git', ['check-ignore', '-q', '.claude/craft-run-record.md'], {
        cwd: ROOT,
        stdio: 'ignore',
      });
    } catch (err) {
      result = err.status;
    }

    assert.strictEqual(result, 0, '.claude/craft-run-record.md must be gitignored');
    assert.strictEqual(
      grepQX('!.claude/craft-run-record.md', GITIGNORE),
      false,
      '.gitignore should NOT re-include the run record',
    );
  },
);

test(
  'Given the memory port doc was authored in S4, when its path is checked, then it exists',
  () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'docs/contributing/specs/memory.md')),
      'docs/contributing/specs/memory.md should exist',
    );
  },
);

test(
  'Given source and tests must carry no provenance refs, when engine/src/observability/memory.js and engine/test/memory.test.js are checked, then no P22 or ADR tokens appear',
  () => {
    const memorySrc = path.join(ROOT, 'engine/src/observability/memory.js');
    const memoryTest = path.join(ROOT, 'engine/test/memory.test.js');
    assert.ok(
      !grepRE('P22|ADR-[0-9]', memorySrc, memoryTest),
      'engine/src/observability/memory.js and engine/test/memory.test.js should contain no P22 or ADR tokens',
    );
  },
);

// Mirrors the "Content whitelist" key-fields table in docs/contributing/specs/memory.md —
// the merge-identity fields every entry of a concern must carry.
const CONCERN_KEY_FIELDS = {
  toolchain: ['ecosystem'],
  'gate-cmd': ['phase'],
  'validation-tool': ['id'],
  findings: ['file', 'pattern'],
  'part-sizing': ['size'],
};

function hasNonEmptyField(entry, field) {
  const value = entry[field];
  return typeof value === 'string' ? value.length > 0 : value !== undefined && value !== null;
}

// Real validate-on-read predicates from the "Content whitelist" table in
// docs/contributing/specs/memory.md, so loading the committed store through
// them has a genuine failure mode (part-sizing is intentionally excluded — the
// spec defaults it to () => true, no stable re-check).
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isRepoRelativePath = (value) =>
  isNonEmptyString(value) && !value.startsWith('/') && !value.includes('$HOME');
const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const isBareCommand = (value) =>
  isNonEmptyString(value) && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(value) && !value.startsWith('export ');

const SPEC_VALIDATORS = {
  toolchain: (e) => isNonEmptyString(e.ecosystem) && isNonEmptyString(e.lockfileFingerprint),
  'gate-cmd': (e) => isNonEmptyString(e.phase) && isBareCommand(e.command),
  'validation-tool': (e) => isNonEmptyString(e.id) && isNonEmptyString(e.configFingerprint),
  findings: (e) => isRepoRelativePath(e.file) && VALID_SEVERITIES.has(e.severity) && isNonEmptyString(e.pattern),
};

// A one-way ratchet against bulk entry loss. Growth is free; a drop below any floor is a
// hard failure. Decay removes at most one step of confidence per run and evicts only at
// the floor, so a concern shedding entries in bulk is a regeneration or merge accident,
// which is precisely how this store previously lost records that had to be hand-restored.
// Raise a floor when the store legitimately grows. Never lower one to make this pass.
const CONCERN_FLOORS = Object.freeze({
  toolchain: 1,
  'gate-cmd': 2,
  'validation-tool': 1,
  findings: 40,
  'part-sizing': 30,
});

test(
  'Given the committed memory store content, when it is parsed, then all five concerns are present with positive counts and every entry carries its key fields',
  async () => {
    const { parseStore, CONCERNS } = await importMemoryModule();
    const raw = fs.readFileSync(STORE_PATH, 'utf8');

    const sut = parseStore(raw);

    assert.ok(sut, 'the committed store should parse');
    assert.deepStrictEqual(
      Object.keys(sut.entries).sort(),
      [...CONCERNS].sort(),
      'every concern key should be present',
    );

    const counts = Object.fromEntries(
      Object.entries(sut.entries).map(([concern, entries]) => [concern, entries.length]),
    );
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    assert.ok(total > 0, 'the store should contain at least one entry');
    for (const concern of CONCERNS) {
      assert.ok(
        counts[concern] >= CONCERN_FLOORS[concern],
        `${concern} holds ${counts[concern]} entries, below the recorded floor of ${CONCERN_FLOORS[concern]} — `
        + 'entries are only ever decayed one step at a time, so a drop below the floor means bulk loss, '
        + 'not normal decay. Revise a floor upward when the store legitimately grows, never downward.',
      );
      for (const entry of sut.entries[concern]) {
        for (const field of CONCERN_KEY_FIELDS[concern]) {
          assert.ok(
            hasNonEmptyField(entry, field),
            `every ${concern} entry should carry a non-empty "${field}"`,
          );
        }
      }
    }
  },
);

test(
  'Given the committed memory store, when it is loaded through the real store path with the spec\'s validate-on-read predicates, then it is not reported malformed and nothing is evicted',
  async () => {
    const { load } = await importMemoryModule();

    const sut = load(ROOT, { readStore: (p) => fs.readFileSync(p, 'utf8'), validators: SPEC_VALIDATORS });

    assert.strictEqual(sut.loadNote, null, 'the committed store should not be reported malformed');
    assert.deepStrictEqual(sut.evicted, []);
  },
);

test(
  'Given the committed memory store, when it is re-serialized from its own parsed view, then the result is byte-identical to the committed file',
  async () => {
    const { load, serializeStore } = await importMemoryModule();
    const raw = fs.readFileSync(STORE_PATH, 'utf8');

    const sut = serializeStore(load(ROOT, { readStore: () => raw, validators: {} }));

    // The markdown body is derived from the frontmatter, so a hand-edit to one without the
    // other leaves the file disagreeing with itself until some unrelated run silently
    // rewrites it. Comparing bytes — not just a parse round-trip — is what catches that.
    assert.strictEqual(sut, raw, 'the committed store should already be canonical engine output');
  },
);

test(
  'Given the committed memory store, when every loaded entry is checked, then its confidence is an integer within FLOOR..CEILING',
  async () => {
    const { load, FLOOR, CEILING } = await importMemoryModule();

    const sut = load(ROOT, { readStore: (p) => fs.readFileSync(p, 'utf8') });
    const allEntries = Object.values(sut.entries).flat();

    assert.ok(allEntries.length > 0, 'the loaded store should not be empty');
    assert.ok(
      allEntries.every(
        (entry) => Number.isInteger(entry.confidence) && entry.confidence > FLOOR && entry.confidence <= CEILING,
      ),
      'every entry confidence should be an integer in FLOOR..CEILING',
    );
  },
);

test(
  'Given the committed memory store content, when parsed then serialized twice, then the round-trip is stable and lossless',
  async () => {
    const { parseStore, serializeStore } = await importMemoryModule();
    const raw = fs.readFileSync(STORE_PATH, 'utf8');

    const sut = parseStore(raw);

    assert.ok(sut, 'the committed store should parse');
    const view = { entries: sut.entries, evicted: [], loadNote: null };
    const first = serializeStore(view);
    const second = serializeStore(view);
    assert.strictEqual(first, second, 'serializeStore should be deterministic across calls');
    assert.deepStrictEqual(parseStore(first).entries, sut.entries, 'reparsing the serialized store should round-trip losslessly');
  },
);
