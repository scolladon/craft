'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function runCmd(cmd, args = [], opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return { status: 0, output: stdout };
  } catch (err) {
    return {
      status: err.status ?? 1,
      output: (err.stdout ?? '') + (err.stderr ?? ''),
    };
  }
}

test(
  'Given the default-resolution engine tests run from repo-root cwd, then they exit 0 (cwd-hermetic)',
  () => {
    const r = runCmd(
      'bash',
      [
        '-c',
        'cd "$1" && node --test engine/test/manifest-lint-main.test.js engine/test/contracts-lint-main.test.js',
        '_',
        ROOT,
      ],
    );
    assert.strictEqual(r.status, 0, `Tests failed:\n${r.output}`);
  },
);

test(
  'Given a hostile seeded ambient (HOME with a user policy, cwd with an INVALID default manifest and no contracts dir), when the ambient-sensitive engine tests run, then they still exit 0 (ambient-hermetic, not merely lucky)',
  () => {
    const hostileHome = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hostile-home-'));
    const hostileCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-hostile-cwd-'));
    try {
      fs.mkdirSync(path.join(hostileHome, '.claude'), { recursive: true });
      fs.mkdirSync(path.join(hostileCwd, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(hostileHome, '.claude', 'craft-policy.md'),
        '---\npolicy:\n  maybe: [integrate]\n---\n',
      );
      fs.writeFileSync(
        path.join(hostileCwd, '.claude', 'workflow.md'),
        '---\n: : not valid yaml : :\n---\n',
      );
      const r = runCmd(
        'bash',
        [
          '-c',
          'cd "$1" && HOME="$2" USERPROFILE="$2" node --test "$3" "$4" "$5"',
          '_',
          hostileCwd,
          hostileHome,
          path.join(ROOT, 'engine/test/manifest-lint-main.test.js'),
          path.join(ROOT, 'engine/test/contracts-lint-main.test.js'),
          path.join(ROOT, 'engine/test/pipeline-resolve-main.test.js'),
        ],
      );
      assert.strictEqual(r.status, 0, `Hostile-ambient tests failed:\n${r.output}`);
    } finally {
      fs.rmSync(hostileHome, { recursive: true, force: true });
      fs.rmSync(hostileCwd, { recursive: true, force: true });
    }
  },
);
