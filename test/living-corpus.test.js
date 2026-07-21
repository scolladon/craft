'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'living-corpus.sh');

// Pinned live corpus — see docs/plan/harness-hygiene-prune-gates.md "Part 2":
// verified with `bash scripts/living-corpus.sh` against this branch's docs tree.
const EXPECTED = new Set([
  'BACKLOG.md',
  'docs/DESIGN-customizable-engine.md',
  'docs/DESIGN-history.md',
  'docs/DESIGN-nested-insert-fail-loud.md',
  'docs/DESIGN-portable-named-configs.md',
  'docs/DESIGN-shrink-core-prune-guardrails.md',
  'docs/DOD.md',
  'docs/GUIDE-customizing.md',
  'docs/adapters/backlog.md',
  'docs/adapters/codex-poc-record.md',
  'docs/adapters/copilot-poc-record.md',
  'docs/adapters/execution.md',
  'docs/adapters/gate.md',
  'docs/adapters/intention.md',
  'docs/adapters/memory.md',
  'docs/adapters/model.md',
  'docs/adapters/opencode-poc-record.md',
  'docs/adapters/pi-poc-record.md',
  'docs/adapters/policy.md',
  'docs/adapters/telemetry.md',
  'docs/adapters/vcs.md',
]);

test('Given the repo root, when living-corpus.sh runs, then it emits exactly the pinned corpus as a set', () => {
  const out = execFileSync('bash', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });

  const lines = out.split('\n').filter(Boolean);
  const result = new Set(lines);

  assert.strictEqual(lines.length, EXPECTED.size, 'expected no duplicate emission');
  assert.deepStrictEqual(result, EXPECTED);
});

test('Given the pinned corpus output, when read as LC_ALL=C-sorted lines, then it matches sort -c', () => {
  const out = execFileSync('bash', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });

  const result = spawnSync('sort', ['-c'], {
    input: out,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });

  assert.strictEqual(result.status, 0, `expected LC_ALL=C-sorted output; sort -c stderr: ${result.stderr}`);
});

test('Given an empty directory with no living pages, when living-corpus.sh runs, then it exits non-zero with a stderr message', () => {
  const emptyDir = mkdtempSync(path.join(os.tmpdir(), 'living-corpus-empty-'));

  try {
    const result = spawnSync('bash', [SCRIPT], { cwd: emptyDir, encoding: 'utf8' });

    assert.notStrictEqual(result.status, 0, 'expected non-zero exit on zero-file enumeration');
    assert.ok(
      (result.stderr || '').includes('enumerated zero living pages'),
      `expected the zero-page stderr message; got: ${result.stderr}`
    );
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }
});
