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
const UNSUPPORTED_ARCH = 'riscv64';
const YQ_RELEASE_URL = 'https://github.com/mikefarah/yq/releases/download/v4.44.3';
const APT_UPDATE = 'apt-get update';
const APT_INSTALL = 'apt-get install -y bats shellcheck jq';
const SHARED_SCRIPT_STEP = 'bash scripts/install-dev-tools.sh';
const INLINE_INSTALL = [/apt-get install/, /mikefarah\/yq/];

const STUBS = {
  dpkg: 'echo "$FAKE_ARCH"',
  id: 'echo "$FAKE_UID"',
  sudo: 'echo "sudo" >> "$TOOL_LOG"; exec "$@"',
  'apt-get': 'echo "apt-get $*" >> "$TOOL_LOG"',
  curl: 'echo "curl $*" >> "$TOOL_LOG"',
  chmod: 'echo "chmod $*" >> "$TOOL_LOG"',
};

function runInstall({ arch, uid }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), THROWAWAY_PREFIX));
  try {
    const stubDir = path.join(tmp, 'bin');
    const toolLog = path.join(tmp, 'tools.log');
    fs.mkdirSync(stubDir);
    for (const [name, body] of Object.entries(STUBS)) {
      fs.writeFileSync(path.join(stubDir, name), `#!/usr/bin/env bash\n${body}\n`, { mode: EXECUTABLE_MODE });
    }
    fs.writeFileSync(toolLog, '');
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        TOOL_LOG: toolLog,
        FAKE_ARCH: arch,
        FAKE_UID: uid,
        YQ_BIN_DIR: tmp,
      },
    });
    const log = fs.readFileSync(toolLog, 'utf8').split('\n').filter(Boolean);
    return { status: result.status, stderr: result.stderr, log, target: tmp };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const toolLines = (log) => log.filter((line) => line !== 'sudo');

function expectedToolLines(target, asset) {
  return [
    APT_UPDATE,
    APT_INSTALL,
    `curl -fsSL -o ${target}/yq ${YQ_RELEASE_URL}/${asset}`,
    `chmod +x ${target}/yq`,
  ];
}

test('Given an amd64 machine, when the install script runs, then it installs bats, shellcheck and jq and fetches the amd64 yq v4.44.3 into the target dir', () => {
  const sut = runInstall({ arch: 'amd64', uid: NON_ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.deepStrictEqual(toolLines(sut.log), expectedToolLines(sut.target, 'yq_linux_amd64'));
});

test('Given an arm64 machine, when the install script runs, then it fetches the arm64 yq', () => {
  const sut = runInstall({ arch: 'arm64', uid: NON_ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.deepStrictEqual(toolLines(sut.log), expectedToolLines(sut.target, 'yq_linux_arm64'));
});

test('Given an unsupported architecture, when the install script runs, then it exits non-zero naming the architecture and installs nothing', () => {
  const sut = runInstall({ arch: UNSUPPORTED_ARCH, uid: NON_ROOT_UID });

  assert.notStrictEqual(sut.status, 0);
  assert.ok(sut.stderr.includes(UNSUPPORTED_ARCH), sut.stderr);
  assert.ok(!sut.log.some((line) => line.startsWith('apt-get')), sut.log.join('\n'));
});

test('Given root, when the script runs, then it calls the tools without sudo', () => {
  const sut = runInstall({ arch: 'amd64', uid: ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.ok(!sut.log.includes('sudo'));
  assert.deepStrictEqual(toolLines(sut.log), expectedToolLines(sut.target, 'yq_linux_amd64'));
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
