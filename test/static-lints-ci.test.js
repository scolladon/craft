'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const STATIC_LINTS_SCRIPT = path.join(ROOT, 'scripts', 'static-lints.sh');
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');
const STATIC_LINTS_CALL = /^bash scripts\/static-lints\.sh$/m;

const THROWAWAY_PREFIX = 'static-lints-';
const LINT_LOG_NAME = 'lint.log';
const EXECUTABLE_MODE = 0o755;
// Distinct from 1 and 2 so an exit with it proves the lint's own status propagated.
const STUB_FAIL_STATUS = 3;
const NO_FAILING_LINT = '';
// errexit ignores a failure in every command of an && list except the last, so a joined
// list that ends the file still exits with the lint's status. A statement after the lints
// exposes every position that is not its own statement.
const TRAILING_STATEMENT = 'true\n';

const LINT_IDS = [
  'shellcheck',
  'pipeline-lint pipeline/default.yml',
  'pipeline-resolve pipeline/default.yml',
  'contracts-lint contracts',
  'backlog-lint BACKLOG.md',
  'design-lint templates/design.md',
  'docs-structure-lint docs/contributing',
  'docs-structure-lint docs/guides',
  'docs-structure-lint --audience docs',
  'sync-adapter-agents --check',
];
const LOOP_FOLLOWERS = new Map([
  ['backlog-lint BACKLOG.md', 'backlog-lint templates/backlog.md'],
  ['design-lint templates/design.md', 'design-lint docs/contributing/design/a.md'],
]);
const ALL_INVOCATIONS = LINT_IDS.flatMap((id) => [id, ...(LOOP_FOLLOWERS.has(id) ? [LOOP_FOLLOWERS.get(id)] : [])]);

const SHELL_STUB_NAMES = ['backlog-lint', 'design-lint', 'docs-structure-lint', 'sync-adapter-agents'];
const NODE_STUB_NAMES = ['pipeline-lint', 'pipeline-resolve', 'contracts-lint'];
const LINT_INPUTS = ['BACKLOG.md', 'templates/backlog.md', 'templates/design.md', 'docs/contributing/design/a.md', 'hooks/h.sh'];

function shellStub(idExpression) {
  return [
    '#!/usr/bin/env bash',
    `id="${idExpression}"`,
    'echo "$id" >> "$LINT_LOG"',
    `if [ "$id" = "$FAIL_LINT" ]; then exit ${STUB_FAIL_STATUS}; fi`,
    '',
  ].join('\n');
}

function nodeStub(name) {
  return [
    "const fs = require('node:fs');",
    `const id = ['${name}', ...process.argv.slice(2)].join(' ');`,
    "fs.appendFileSync(process.env.LINT_LOG, id + '\\n');",
    `process.exit(id === process.env.FAIL_LINT ? ${STUB_FAIL_STATUS} : 0);`,
    '',
  ].join('\n');
}

function writeThrowawayFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { mode: EXECUTABLE_MODE });
}

function buildThrowaway() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), THROWAWAY_PREFIX)));
  writeThrowawayFile(root, 'scripts/static-lints.sh', fs.readFileSync(STATIC_LINTS_SCRIPT, 'utf8') + TRAILING_STATEMENT);
  writeThrowawayFile(root, 'bin/shellcheck', shellStub('shellcheck'));
  for (const name of SHELL_STUB_NAMES) writeThrowawayFile(root, `scripts/${name}.sh`, shellStub(`${name} $*`));
  for (const name of NODE_STUB_NAMES) writeThrowawayFile(root, `engine/bin/${name}.js`, nodeStub(name));
  for (const input of LINT_INPUTS) writeThrowawayFile(root, input, '');
  return root;
}

function readInvocations(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
}

function runStaticLints(failingLint) {
  const root = buildThrowaway();
  const logPath = path.join(root, LINT_LOG_NAME);
  try {
    const result = spawnSync('bash', [path.join(root, 'scripts', 'static-lints.sh')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
        FAIL_LINT: failingLint,
        LINT_LOG: logPath,
      },
    });
    if (result.error) throw result.error;
    return { status: result.status, invocations: readInvocations(logPath) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('Given every stubbed lint green, when static-lints runs, then it exits 0 after all twelve invocations in block order', () => {
  // Arrange
  const failingLint = NO_FAILING_LINT;

  // Act
  const sut = runStaticLints(failingLint);

  // Assert
  assert.strictEqual(sut.status, 0);
  assert.deepStrictEqual(sut.invocations, ALL_INVOCATIONS);
});

for (const lintId of LINT_IDS) {
  test(`Given the lint "${lintId}" fails with a statement after the lints, when static-lints runs, then it exits with that lint's status and no later lint runs`, () => {
    // Arrange
    const expectedInvocations = ALL_INVOCATIONS.slice(0, ALL_INVOCATIONS.indexOf(lintId) + 1);

    // Act
    const sut = runStaticLints(lintId);

    // Assert
    assert.strictEqual(sut.status, STUB_FAIL_STATUS);
    assert.deepStrictEqual(sut.invocations, expectedInvocations);
  });
}

test('Given scripts/ci.sh, when its content is read, then it calls static-lints as a bare statement', () => {
  // Arrange
  const sut = fs.readFileSync(CI_SCRIPT, 'utf8');

  // Act
  const result = STATIC_LINTS_CALL.test(sut);

  // Assert
  assert.strictEqual(result, true);
});
