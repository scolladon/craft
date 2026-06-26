// Imported for its side effect: redirects $HOME (and USERPROFILE for Windows parity)
// to an empty scratch dir AT IMPORT TIME. A test file imports this BEFORE any module
// that reads ~/.claude during its own module evaluation, so ambient user state cannot
// leak into the suite regardless of the developer's or CI's home directory. Call
// restoreEmptyHome() from an after() hook to restore the env and remove the scratch dir.
//
// Each test file runs in its own process under `node --test`, so the import-time redirect
// is scoped to that file; restoreEmptyHome() is idempotent cleanup, not cross-file teardown.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exported so tests can assert restore returns env to exactly these prior values.
export const priorHome = process.env.HOME;
export const priorProfile = process.env.USERPROFILE;

export const emptyHomeDir = mkdtempSync(join(tmpdir(), 'craft-home-'));
process.env.HOME = emptyHomeDir;
process.env.USERPROFILE = emptyHomeDir;

export function restoreEmptyHome() {
  if (priorHome === undefined) delete process.env.HOME;
  else process.env.HOME = priorHome;
  if (priorProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = priorProfile;
  rmSync(emptyHomeDir, { recursive: true, force: true });
}
