'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/';
const BARE_INVOCATION_PATTERN = /\$\{CLAUDE_PLUGIN_ROOT\}\//;

// Pinned counts (grep -rc '\${CLAUDE_PLUGIN_ROOT}/' before rewrite) — 34 total
// across 15 files. Kept per-file so a miscount on any single file fails loud
// instead of averaging out against the total.
const TARGET_FILES = [
  { file: 'hooks/hooks.json', count: 1 },
  { file: 'skills/decisions/SKILL.md', count: 1 },
  { file: 'skills/design/SKILL.md', count: 1 },
  { file: 'skills/documentation/SKILL.md', count: 1 },
  { file: 'skills/init/SKILL.md', count: 5 },
  { file: 'skills/integrate/SKILL.md', count: 1 },
  { file: 'skills/metrics/SKILL.md', count: 2 },
  { file: 'skills/planning/SKILL.md', count: 2 },
  { file: 'skills/promote-config/SKILL.md', count: 4 },
  { file: 'skills/requirements/SKILL.md', count: 1 },
  { file: 'skills/review/SKILL.md', count: 1 },
  { file: 'skills/run/SKILL.md', count: 6 },
  { file: 'skills/tune/SKILL.md', count: 5 },
  { file: 'skills/validation/SKILL.md', count: 3 },
  { file: 'skills/workspace/SKILL.md', count: 2 },
];

// Non-path prose mentions of CLAUDE_PLUGIN_ROOT that must survive the rewrite
// untouched (they are not path invocations, so the shim does not apply).
const PRESERVED_PROSE = [
  {
    file: 'skills/metrics/SKILL.md',
    text: 'Confirm `${CLAUDE_PLUGIN_ROOT}` is set and the entrypoint exists:',
  },
  {
    file: 'skills/metrics/SKILL.md',
    text: 'engine/bin/usage-mine.js not found — check CLAUDE_PLUGIN_ROOT',
  },
  {
    file: 'skills/run/SKILL.md',
    text: 'at the repo ROOT (the worktree/checkout root — NEVER `${CLAUDE_PLUGIN_ROOT}`, hard',
  },
];

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

for (const { file, count } of TARGET_FILES) {
  test(
    `Given ${file}, when scanned for CRAFT_ROOT-shimmed invocations, then it contains exactly ${count} shimmed occurrence(s)`,
    () => {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');

      assert.strictEqual(countOccurrences(content, SHIM), count);
    },
  );

  test(
    `Given ${file}, when scanned for bare CLAUDE_PLUGIN_ROOT path invocations, then none remain outside the CRAFT_ROOT shim`,
    () => {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const withoutShims = content.split(SHIM).join('');

      assert.ok(
        !BARE_INVOCATION_PATTERN.test(withoutShims),
        `expected no \${CLAUDE_PLUGIN_ROOT}/ invocation outside the CRAFT_ROOT shim in ${file}`,
      );
    },
  );
}

for (const { file, text } of PRESERVED_PROSE) {
  test(
    `Given ${file}, when checked for the non-path CLAUDE_PLUGIN_ROOT prose mention, then it is preserved verbatim`,
    () => {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');

      assert.ok(content.includes(text), `expected prose mention preserved verbatim in ${file}: ${text}`);
    },
  );
}

test(
  'Given CRAFT_ROOT unset and CLAUDE_PLUGIN_ROOT set, when the shim expands in bash, then it resolves to CLAUDE_PLUGIN_ROOT (Claude behaviour preserved)',
  () => {
    const stdout = execFileSync('bash', ['-c', 'printf %s "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}"'], {
      env: { PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: '/x' },
      encoding: 'utf8',
    });

    assert.strictEqual(stdout, '/x');
  },
);

test(
  'Given both CRAFT_ROOT and CLAUDE_PLUGIN_ROOT set, when the shim expands in bash, then CRAFT_ROOT wins (opencode override)',
  () => {
    const stdout = execFileSync('bash', ['-c', 'printf %s "${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}"'], {
      env: { PATH: process.env.PATH, CRAFT_ROOT: '/y', CLAUDE_PLUGIN_ROOT: '/x' },
      encoding: 'utf8',
    });

    assert.strictEqual(stdout, '/y');
  },
);
