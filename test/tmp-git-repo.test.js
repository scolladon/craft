'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTmpGitRepo } = require('./helpers/tmp-git-repo');

const TRACKED_FIXTURE = 'docs/a.md';
const EXCLUDE_EVERY_MARKDOWN = '*.md\n';

// The suite's own git calls must not depend on the ambient environment the tests vary.
function hermeticGitEnv() {
  return {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

function runHermeticGit(repoDir, ...args) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', env: hermeticGitEnv() });
}

// Restores from saved values: assigning `undefined` to a process.env key stores the string "undefined".
function withAmbientEnv(overrides, act) {
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    return act();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Given a decoy GIT_DIR and GIT_WORK_TREE on the parent process, when createTmpGitRepo builds a repo, then the throwaway tracks its own files and the decoy gains no index', () => {
  const decoyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-git-repo-decoy-'));
  let repo;
  try {
    runHermeticGit(decoyDir, 'init', '-q');
    const ambientGitLocation = { GIT_DIR: path.join(decoyDir, '.git'), GIT_WORK_TREE: decoyDir };
    const sut = createTmpGitRepo;

    repo = withAmbientEnv(ambientGitLocation, () => sut([TRACKED_FIXTURE]));

    assert.ok(fs.existsSync(path.join(repo.root, '.git')), 'the throwaway must receive its own .git despite the ambient GIT_DIR');
    assert.strictEqual(runHermeticGit(repo.root, 'ls-files'), `${TRACKED_FIXTURE}\n`);
    assert.strictEqual(fs.existsSync(path.join(decoyDir, '.git', 'index')), false, 'the decoy must not be staged into');
  } finally {
    repo?.cleanup();
    fs.rmSync(decoyDir, { recursive: true, force: true });
  }
});

test('Given an ambient HOME whose global excludes file ignores every markdown file, when createTmpGitRepo builds a repo, then the markdown fixture is still tracked', () => {
  const ambientHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-git-repo-home-'));
  let repo;
  try {
    const configHome = path.join(ambientHome, '.config');
    fs.mkdirSync(path.join(configHome, 'git'), { recursive: true });
    fs.writeFileSync(path.join(configHome, 'git', 'ignore'), EXCLUDE_EVERY_MARKDOWN);
    const sut = createTmpGitRepo;

    repo = withAmbientEnv({ HOME: ambientHome, XDG_CONFIG_HOME: configHome }, () => sut([TRACKED_FIXTURE]));

    assert.strictEqual(runHermeticGit(repo.root, 'ls-files'), `${TRACKED_FIXTURE}\n`);
  } finally {
    repo?.cleanup();
    fs.rmSync(ambientHome, { recursive: true, force: true });
  }
});
