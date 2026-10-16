'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const { createRunRepo } = require('./helpers/craft-run');
const { withFailingCommitSigner } = require('./helpers/commit-signing');

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
