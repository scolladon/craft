'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withAmbientEnv } = require('./ambient-env');

// Command-scope `-c` outranks every config file and GIT_CONFIG_COUNT, so an ambient signer can never reach a fixture commit.
const UNSIGNED_COMMIT_CONFIG = Object.freeze(['-c', 'commit.gpgsign=false']);

// `false` as the signer fails every signature at once, the same failure a starved gpg-agent produces under load.
const FAILING_SIGNER_CONFIG = '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = false\n';

function withFailingCommitSigner(act) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'failing-signer-'));
  const configPath = path.join(dir, 'gitconfig');
  fs.writeFileSync(configPath, FAILING_SIGNER_CONFIG);
  try {
    return withAmbientEnv({ GIT_CONFIG_GLOBAL: configPath }, act);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { UNSIGNED_COMMIT_CONFIG, withFailingCommitSigner };
