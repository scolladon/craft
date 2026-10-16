import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approves, worktreePaths } from '../worktree-approver.mjs';

const REPO = '/work/craft';
const LISTED = ['/work/craft', '/work/craft-rules-fix'];

test('Given a listed sibling worktree named after the repo, When EnterWorktree targets it, Then it is approved', () => {
  const sut = approves({ tool_name: 'EnterWorktree', tool_input: { path: '/work/craft-rules-fix' } }, REPO, LISTED);
  assert.equal(sut, true);
});

test('Given a path git does not list, When EnterWorktree targets it, Then it is not approved', () => {
  const sut = approves({ tool_name: 'EnterWorktree', tool_input: { path: '/work/craft-unknown' } }, REPO, LISTED);
  assert.equal(sut, false);
});

test('Given the main checkout itself, When EnterWorktree targets it, Then it is not approved', () => {
  const sut = approves({ tool_name: 'EnterWorktree', tool_input: { path: '/work/craft' } }, REPO, LISTED);
  assert.equal(sut, false);
});

test('Given a listed worktree outside the repo naming scheme, When EnterWorktree targets it, Then it is not approved', () => {
  const sut = approves({ tool_name: 'EnterWorktree', tool_input: { path: '/tmp/elsewhere' } }, REPO, [...LISTED, '/tmp/elsewhere']);
  assert.equal(sut, false);
});

test('Given a dot-dot path that resolves outside the scheme, When EnterWorktree targets it, Then it is not approved', () => {
  const sut = approves({ tool_name: 'EnterWorktree', tool_input: { path: '/work/craft-rules-fix/../../etc' } }, REPO, LISTED);
  assert.equal(sut, false);
});

test('Given another tool, When a permission is requested, Then it is not approved', () => {
  const sut = approves({ tool_name: 'Bash', tool_input: { command: 'git push' } }, REPO, LISTED);
  assert.equal(sut, false);
});

test('Given porcelain output, When worktree paths are read, Then every worktree line yields its path', () => {
  const sut = worktreePaths('worktree /work/craft\nHEAD abc\nbranch refs/heads/main\n\nworktree /work/craft-rules-fix\nHEAD def\n');
  assert.deepEqual(sut, ['/work/craft', '/work/craft-rules-fix']);
});

test('Given a requested path that differs from its resolved path, When EnterWorktree targets it, Then it is not approved', () => {
  const sut = approves({ tool_name: 'EnterWorktree', tool_input: { path: '/work/craft-rules-fix' } }, REPO, LISTED, '/elsewhere');
  assert.equal(sut, false);
});
