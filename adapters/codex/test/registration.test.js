import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CI_SCRIPT = join(REPO_ROOT, 'scripts', 'ci.sh');
const EVERY_TEST_FILE_REGISTERS = join(REPO_ROOT, 'test', 'every-test-file-registers.test.js');

describe('CI registration — scripts/ci.sh', () => {
  it('Given scripts/ci.sh, when read, then it registers the codex adapter suite', () => {
    const sut = readFileSync(CI_SCRIPT, 'utf8');

    assert.ok(sut.includes('run_suite adapters/codex'));
  });
});

describe('CI registration — test/every-test-file-registers.test.js', () => {
  it('Given test/every-test-file-registers.test.js, when read, then its suite list names the codex test directory', () => {
    const sut = readFileSync(EVERY_TEST_FILE_REGISTERS, 'utf8');

    assert.ok(sut.includes("'adapters', 'codex', 'test'"));
  });
});
