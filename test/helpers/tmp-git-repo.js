'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Builds a throwaway git repository under a fresh mkdtemp directory,
// populates it with the given relative file paths (empty content, parent
// directories created as needed), and stages them so `git ls-files` reports
// them without needing a commit.
//
// The root is realpath'd before it is returned: on macOS `$TMPDIR` is itself
// a symlink (/var/folders/... -> /private/var/folders/...), and the script
// under test compares its own `git rev-parse --show-toplevel` (physical)
// against a caller-supplied directory resolved with `pwd` (logical). Skipping
// the realpath here would make every path comparison silently mismatch.
function createTmpGitRepo(relativeFilePaths) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-structure-lint-'));
  const root = fs.realpathSync(tmpDir);

  for (const relativeFilePath of relativeFilePaths) {
    const absoluteFilePath = path.join(root, relativeFilePath);
    fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
    fs.writeFileSync(absoluteFilePath, '');
  }

  const runGit = (...args) =>
    execFileSync(
      'git',
      ['-C', root, '-c', 'user.email=tmp-git-repo@example.com', '-c', 'user.name=tmp-git-repo', ...args],
      { encoding: 'utf8' }
    );

  runGit('init', '-q');
  runGit('add', '-A');

  const cleanup = () => fs.rmSync(root, { recursive: true, force: true });

  return { root, cleanup };
}

module.exports = { createTmpGitRepo };
