'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const GITIGNORE = path.join(ROOT, '.gitignore');

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
  'Given the ledger is run-local, when .gitignore is checked, then no re-include names the run record',
  () => {
    assert.strictEqual(
      grepQX('!.claude/craft-run-record.md', GITIGNORE),
      false,
      '.gitignore should NOT contain "!.claude/craft-run-record.md"',
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
