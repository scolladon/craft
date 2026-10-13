'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'install-dev-tools.sh');
const CI_WORKFLOW = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const yaml = createRequire(path.join(ROOT, 'engine', 'package.json'))('js-yaml');

const THROWAWAY_PREFIX = 'install-dev-tools-';
const EXECUTABLE_MODE = 0o755;
const NON_ROOT_UID = '1000';
const ROOT_UID = '0';
const SUDO = 'sudo';
const APT_UPDATE = 'apt-get update';
const APT_INSTALL = 'apt-get install -y shellcheck jq zsh';
const SHARED_SCRIPT_STEP = 'bash scripts/install-dev-tools.sh';
const INLINE_INSTALL = [/apt-get install/];

const STUBS = {
  id: '[ "$1" = -u ] || exit 64; echo "$FAKE_UID"',
  sudo: 'echo "sudo $1" >> "$TOOL_LOG"; exec "$@"',
  'apt-get': 'echo "apt-get $*" >> "$TOOL_LOG"',
};

function writeStubs(stubDir) {
  fs.mkdirSync(stubDir);
  for (const [name, body] of Object.entries(STUBS)) {
    fs.writeFileSync(path.join(stubDir, name), `#!/usr/bin/env bash\n${body}\n`, { mode: EXECUTABLE_MODE });
  }
}

function runInstall({ uid }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), THROWAWAY_PREFIX));
  try {
    const stubDir = path.join(tmp, 'bin');
    const toolLog = path.join(tmp, 'tools.log');
    writeStubs(stubDir);
    fs.writeFileSync(toolLog, '');
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        TOOL_LOG: toolLog,
        FAKE_UID: uid,
      },
    });
    const log = fs.readFileSync(toolLog, 'utf8').split('\n').filter(Boolean);
    return { status: result.status, stderr: result.stderr, log };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function expectedNonRootLog() {
  return [`${SUDO} apt-get`, APT_UPDATE, `${SUDO} apt-get`, APT_INSTALL];
}

const withoutSudo = (log) => log.filter((line) => !line.startsWith(`${SUDO} `));

test('Given a non-root user, when the install script runs, then every apt-get call goes through sudo', () => {
  const sut = runInstall({ uid: NON_ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.deepStrictEqual(sut.log, expectedNonRootLog());
});

test('Given root, when the install script runs, then it calls apt-get without sudo', () => {
  const sut = runInstall({ uid: ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.deepStrictEqual(sut.log, withoutSudo(expectedNonRootLog()));
});

test('Given the CI workflow, when the ci job steps are read, then dev tools come from the shared install script and no step installs them inline', () => {
  const doc = yaml.load(fs.readFileSync(CI_WORKFLOW, 'utf8'));

  const sut = doc.jobs.ci.steps.map((step) => step.run).filter(Boolean);
  const allRuns = Object.values(doc.jobs).flatMap((job) => job.steps.map((step) => step.run).filter(Boolean));

  assert.ok(sut.includes(SHARED_SCRIPT_STEP));
  for (const pattern of INLINE_INSTALL) {
    assert.ok(!allRuns.some((run) => pattern.test(run)), `inline install matches ${pattern}`);
  }
});
