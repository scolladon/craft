'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');

test('Given the node test harness, when a trivial subprocess runs, then it exits 0', () => {
  const r = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.strictEqual(r.status, 0);
});
