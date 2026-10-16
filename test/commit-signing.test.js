'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withFailingCommitSigner } = require('./helpers/commit-signing');

// The suite's own git calls must not depend on the ambient config the helper swaps in.
function hermeticGitEnv() {
  return {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

test('Given a global git config whose signer always fails, when a plain commit runs inside withFailingCommitSigner, then git refuses with gpg failed to sign', () => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-signing-'));
  try {
    execFileSync('git', ['init', '-q', repoDir], { env: hermeticGitEnv() });
    const sut = withFailingCommitSigner;

    const commit = () => sut(() =>
      execFileSync(
        'git',
        ['-C', repoDir, '-c', 'user.email=commit-signing@example.com', '-c', 'user.name=commit-signing', 'commit', '--allow-empty', '-q', '-m', 'plain'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      ),
    );

    assert.throws(commit, /gpg failed to sign/);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});
