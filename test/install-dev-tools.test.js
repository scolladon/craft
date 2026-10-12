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
const CHECKSUM_MISMATCH = '1';
const YQ_RELEASE_URL = 'https://github.com/mikefarah/yq/releases/download/v4.44.3';
const YQ_SHA256 = {
  amd64: 'a2c097180dd884a8d50c956ee16a9cec070f30a7947cf4ebf87d5f36213e9ed7',
  arm64: '0e7e1524f68d91b3ff9b089872d185940ab0fa020a5a9052046ef10547023156',
};
const DOWNLOAD = '<download>';
const SUDO = 'sudo';
const APT_UPDATE = 'apt-get update';
const APT_INSTALL = 'apt-get install -y bats shellcheck jq';
const SHARED_SCRIPT_STEP = 'bash scripts/install-dev-tools.sh';
const INLINE_INSTALL = [/apt-get install/, /mikefarah\/yq/];

const STUBS = {
  dpkg: '[ "$1" = --print-architecture ] || exit 64; echo "$FAKE_ARCH"',
  id: '[ "$1" = -u ] || exit 64; echo "$FAKE_UID"',
  sudo: 'echo "sudo $1" >> "$TOOL_LOG"; exec "$@"',
  'apt-get': 'echo "apt-get $*" >> "$TOOL_LOG"',
  curl: 'echo "curl $1 $2 <download> $4" >> "$TOOL_LOG"; echo fake > "$3"',
  sha256sum: 'read -r hash _; echo "sha256sum $* $hash" >> "$TOOL_LOG"; exit "${FAKE_SHA_STATUS:-0}"',
  install: 'echo "install $1 $2 <download> $4" >> "$TOOL_LOG"',
};

function writeStubs(stubDir) {
  fs.mkdirSync(stubDir);
  for (const [name, body] of Object.entries(STUBS)) {
    fs.writeFileSync(path.join(stubDir, name), `#!/usr/bin/env bash\n${body}\n`, { mode: EXECUTABLE_MODE });
  }
}

function runInstall({ arch, uid, shaStatus = '0' }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), THROWAWAY_PREFIX));
  try {
    const stubDir = path.join(tmp, 'bin');
    const scratch = path.join(tmp, 'scratch');
    const toolLog = path.join(tmp, 'tools.log');
    writeStubs(stubDir);
    fs.mkdirSync(scratch);
    fs.writeFileSync(toolLog, '');
    const result = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        TMPDIR: scratch,
        TOOL_LOG: toolLog,
        FAKE_ARCH: arch,
        FAKE_UID: uid,
        FAKE_SHA_STATUS: shaStatus,
        YQ_BIN_DIR: tmp,
      },
    });
    const log = fs.readFileSync(toolLog, 'utf8').split('\n').filter(Boolean);
    return { status: result.status, stderr: result.stderr, log, target: tmp, leftovers: fs.readdirSync(scratch) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function expectedNonRootLog(target, arch) {
  return [
    `${SUDO} apt-get`, APT_UPDATE,
    `${SUDO} apt-get`, APT_INSTALL,
    `curl -fsSL -o ${DOWNLOAD} ${YQ_RELEASE_URL}/yq_linux_${arch}`,
    `sha256sum -c --quiet - ${YQ_SHA256[arch]}`,
    `${SUDO} install`, `install -m 0755 ${DOWNLOAD} ${target}/yq`,
  ];
}

const withoutSudo = (log) => log.filter((line) => !line.startsWith(`${SUDO} `));

test('Given an amd64 machine as a non-root user, when the install script runs, then every privileged call goes through sudo and the amd64 yq is verified against its pinned checksum before install', () => {
  const sut = runInstall({ arch: 'amd64', uid: NON_ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.deepStrictEqual(sut.log, expectedNonRootLog(sut.target, 'amd64'));
  assert.deepStrictEqual(sut.leftovers, []);
});

test('Given an arm64 machine, when the install script runs, then it fetches and verifies the arm64 yq', () => {
  const sut = runInstall({ arch: 'arm64', uid: NON_ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.deepStrictEqual(sut.log, expectedNonRootLog(sut.target, 'arm64'));
});

test('Given an unsupported architecture, when the install script runs, then it exits non-zero naming the architecture and installs nothing', () => {
  const sut = runInstall({ arch: UNSUPPORTED_ARCH, uid: NON_ROOT_UID });

  assert.notStrictEqual(sut.status, 0);
  assert.ok(sut.stderr.includes(UNSUPPORTED_ARCH), sut.stderr);
  assert.deepStrictEqual(sut.log, []);
});

test('Given root, when the install script runs, then it calls the tools without sudo', () => {
  const sut = runInstall({ arch: 'amd64', uid: ROOT_UID });

  assert.strictEqual(sut.status, 0, sut.stderr);
  assert.deepStrictEqual(sut.log, withoutSudo(expectedNonRootLog(sut.target, 'amd64')));
});

test('Given a yq download whose checksum does not match, when the install script runs, then it exits non-zero, installs no yq and removes the download', () => {
  const sut = runInstall({ arch: 'amd64', uid: NON_ROOT_UID, shaStatus: CHECKSUM_MISMATCH });

  assert.notStrictEqual(sut.status, 0);
  assert.ok(!sut.log.some((line) => line.startsWith('install ')), sut.log.join('\n'));
  assert.deepStrictEqual(sut.leftovers, []);
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
