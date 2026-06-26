// Shared cwd isolation for unit tests that exercise cwd-relative default
// resolution. Each call restores the prior cwd in finally (on return AND on throw).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Create a scratch dir, optionally seed it, chdir in; return a restore() that
// chdirs back to the prior cwd and removes the scratch dir. Internal: withTempCwd wraps it.
function enterTempCwd(seed) {
  const prev = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), 'craft-cwd-'));
  try {
    if (seed) seed(dir);
    process.chdir(dir);
  } catch (err) {
    rmSync(dir, { recursive: true, force: true }); // no leak if seed/chdir throws before restore is returned
    throw err;
  }
  return () => {
    process.chdir(prev);
    rmSync(dir, { recursive: true, force: true });
  };
}

// withTempCwd(fn) or withTempCwd(seed, fn): run fn in a scratch cwd; restore on return
// AND on throw. Returns fn's value. Accepts sync or async fn.
export async function withTempCwd(seedOrFn, maybeFn) {
  const seed = maybeFn ? seedOrFn : undefined;
  const fn = maybeFn ?? seedOrFn;
  const restore = enterTempCwd(seed);
  try {
    return await fn();
  } finally {
    restore();
  }
}
