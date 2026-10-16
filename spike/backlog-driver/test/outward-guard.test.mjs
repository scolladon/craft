import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, approvedActions } from '../outward-guard.mjs';

const NONE = new Set();
const ALL = new Set(['push', 'propose', 'integrate']);

test('Given no pre-approval, When the command pushes through a global option, Then it is denied', () => {
  const sut = judge('git -C . push origin feat/x', NONE);
  assert.equal(sut.block, true);
  assert.match(sut.reason, /push/);
});

test('Given push is approved, When the command pushes, Then it is allowed', () => {
  const sut = judge('git status && git push -u origin feat/x', new Set(['push']));
  assert.equal(sut.block, false);
});

test('Given only push is approved, When the command merges a PR behind an env prefix, Then it is denied', () => {
  const sut = judge('env FOO=1 gh pr merge 3 --squash --admin', new Set(['push']));
  assert.equal(sut.block, true);
  assert.match(sut.reason, /integrate/);
});

test('Given no pre-approval, When the command creates a PR, Then it is denied as propose', () => {
  const sut = judge('cd repo && gh pr create --fill', NONE);
  assert.equal(sut.block, true);
  assert.match(sut.reason, /propose/);
});

test('Given every action approved, When the command is unparseable shell, Then it is denied fail-closed', () => {
  const sut = judge('echo "unterminated && gh pr merge 1', ALL);
  assert.equal(sut.block, true);
});

test('Given no pre-approval, When the command is local-only git, Then it is allowed', () => {
  const sut = judge('git commit -m "fix: x" && git log --oneline -3', NONE);
  assert.equal(sut.block, false);
});

test('Given a brief with a PREAPPROVED line, When it is read, Then the listed actions are approved', () => {
  const sut = approvedActions('# brief\nPREAPPROVED: push, propose , integrate\nbody');
  assert.deepEqual([...sut].sort(), ['integrate', 'propose', 'push']);
});

test('Given a brief without a PREAPPROVED line, When it is read, Then nothing is approved', () => {
  const sut = approvedActions('# brief\nbody');
  assert.equal(sut.size, 0);
});

test('Given no pre-approval, When an unparseable command never mentions push or gh, Then it is allowed', () => {
  const sut = judge('echo "unterminated', NONE);
  assert.equal(sut.block, false);
});

test('Given no pre-approval, When an unparseable command mentions push, Then it is denied fail-closed', () => {
  const sut = judge('echo "unterminated; git push', NONE);
  assert.equal(sut.block, true);
});
