'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRunRepo } = require('./helpers/craft-run');
const { withFailingCommitSigner } = require('./helpers/commit-signing');
const { withAmbientEnv } = require('./helpers/ambient-env');

// The suite's own git calls must not depend on the ambient config the test swaps in.
function hermeticGitEnv() {
  return {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

test('Given a global git config whose signer always fails, when createRunRepo builds a repo, then its init commit lands', () => {
  let repo;
  try {
    const sut = createRunRepo;

    repo = withFailingCommitSigner(() => sut());

    const head = execFileSync('git', ['-C', repo.main, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', env: hermeticGitEnv() });
    assert.match(head, /^[0-9a-f]+\n$/);
  } finally {
    repo?.cleanup();
  }
});

test('Given a global git config whose pre-commit hook always fails, when createRunRepo builds a repo, then it throws and leaves no temp dir behind', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-run-leak-'));
  try {
    const hooksDir = path.join(scratch, 'hooks');
    const tmpDir = path.join(scratch, 'tmp');
    fs.mkdirSync(hooksDir);
    fs.mkdirSync(tmpDir);
    fs.writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const configPath = path.join(scratch, 'gitconfig');
    fs.writeFileSync(configPath, `[core]\n\thooksPath = ${hooksDir}\n`);
    const sut = createRunRepo;

    const result = () => withAmbientEnv({ GIT_CONFIG_GLOBAL: configPath, TMPDIR: tmpDir }, () => sut());

    assert.throws(result);
    assert.deepStrictEqual(fs.readdirSync(tmpDir), []);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
