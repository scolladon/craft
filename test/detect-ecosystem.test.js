'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

function runCmd(cmd, args = [], opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return { status: 0, output: stdout.trim() };
  } catch (err) {
    return {
      status: err.status ?? 1,
      output: ((err.stdout ?? '') + (err.stderr ?? '')).trim(),
    };
  }
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-eco-'));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test(
  'Given the helper is sourced, detect_ecosystem is defined and no detection ran',
  () => {
    const script = path.join(SCRIPTS_DIR, 'detect-ecosystem.sh');
    const r = runCmd('bash', [
      '-c',
      `source '${script}'; declare -f detect_ecosystem > /dev/null && echo defined`,
    ]);
    assert.strictEqual(r.status, 0);
    assert.ok(r.output.includes('defined'), `Expected 'defined' in output:\n${r.output}`);
  },
);

test(
  'Given a dir with package-lock.json, when detect_ecosystem runs, then it echoes npm',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'package-lock.json'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'npm');
    });
  },
);

test(
  'Given a dir with pnpm-lock.yaml, when detect_ecosystem runs, then it echoes pnpm',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'pnpm');
    });
  },
);

test(
  'Given a dir with yarn.lock, when detect_ecosystem runs, then it echoes yarn',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'yarn');
    });
  },
);

test(
  'Given a dir with go.mod, when detect_ecosystem runs, then it echoes go',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'go.mod'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'go');
    });
  },
);

test(
  'Given a dir with bun.lockb, when detect_ecosystem runs, then it echoes bun (first arm of the OR)',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'bun.lockb'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'bun');
    });
  },
);

test(
  'Given a dir with bun.lock, when detect_ecosystem runs, then it echoes bun (second arm of the OR)',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'bun.lock'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'bun');
    });
  },
);

test(
  'Given a dir with uv.lock, when detect_ecosystem runs, then it echoes uv',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'uv.lock'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'uv');
    });
  },
);

test(
  'Given a dir with poetry.lock, when detect_ecosystem runs, then it echoes poetry',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'poetry.lock'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'poetry');
    });
  },
);

test(
  'Given a dir with Cargo.toml, when detect_ecosystem runs, then it echoes cargo',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'Cargo.toml'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'cargo');
    });
  },
);

test(
  'Given a dir with Gemfile.lock, when detect_ecosystem runs, then it echoes bundler',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'Gemfile.lock'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'bundler');
    });
  },
);

test(
  'Given a dir with composer.lock, when detect_ecosystem runs, then it echoes composer',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'composer.lock'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'composer');
    });
  },
);

test(
  'Given a dir with no recognized lockfile or manifest, when detect_ecosystem runs, then it echoes nothing and returns non-zero',
  () => {
    withTmpDir((dir) => {
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.notStrictEqual(r.status, 0);
      assert.strictEqual(r.output, '');
    });
  },
);

test(
  'Given a dir with package-lock.json and pnpm-lock.yaml, when detect_ecosystem runs, then it echoes npm (first-match wins)',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'package-lock.json'), '');
      fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.strictEqual(r.output, 'npm');
    });
  },
);

test(
  'Given detect-ecosystem.sh sourced and run on a package-lock.json fixture dir, when called, then no node_modules appears (detection only, no install)',
  () => {
    withTmpDir((dir) => {
      fs.writeFileSync(path.join(dir, 'package-lock.json'), '');
      const r = runCmd('bash', [path.join(SCRIPTS_DIR, 'detect-ecosystem.sh'), dir]);
      assert.strictEqual(r.status, 0);
      assert.ok(
        !fs.existsSync(path.join(dir, 'node_modules')),
        'node_modules should not be created',
      );
    });
  },
);
