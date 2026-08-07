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

test(
  'Given the committed memory store content, when it is parsed, then all five concerns are present with 67 entries total',
  async () => {
    const { parseStore } = await importMemoryModule();
    const raw = fs.readFileSync(STORE_PATH, 'utf8');

    const sut = parseStore(raw);

    assert.ok(sut, 'the committed store should parse');
    const counts = Object.fromEntries(
      Object.entries(sut.entries).map(([concern, entries]) => [concern, entries.length]),
    );
    assert.deepStrictEqual(counts, {
      toolchain: 1,
      'gate-cmd': 2,
      'validation-tool': 1,
      findings: 43,
      'part-sizing': 20,
    });
  },
);

test(
  'Given the committed memory store, when it is loaded through the real store path, then it is not reported malformed and nothing is evicted',
  async () => {
    const { load } = await importMemoryModule();

    const sut = load(ROOT, { readStore: (p) => fs.readFileSync(p, 'utf8') });

    assert.strictEqual(sut.loadNote, null, 'the committed store should not be reported malformed');
    assert.deepStrictEqual(sut.evicted, []);
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
  'Given the committed memory store, when one decay STEP is simulated on every loaded entry, then every entry still survives above FLOOR',
  async () => {
    const { load, FLOOR, STEP } = await importMemoryModule();

    const sut = load(ROOT, { readStore: (p) => fs.readFileSync(p, 'utf8') });
    const allEntries = Object.values(sut.entries).flat();

    assert.ok(allEntries.length > 0, 'the loaded store should not be empty');
    assert.ok(
      allEntries.every((entry) => entry.confidence - STEP > FLOOR),
      'every entry should survive one decay STEP without evicting at FLOOR',
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
