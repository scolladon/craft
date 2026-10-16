#!/usr/bin/env node
// PermissionRequest hook for driven background sessions: answers the EnterWorktree
// permission-root prompt for craft's own worktree, a git-registered sibling named <repo>-<slug>.
// Anything else gets no answer, so the person sees the normal prompt.
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const WORKTREE_LINE = /^worktree (.+)$/;
const ALLOW = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };

export const worktreePaths = porcelain =>
  porcelain.split('\n').map(line => line.match(WORKTREE_LINE)).filter(Boolean).map(match => match[1]);

const isCraftSibling = (target, repoRoot) =>
  target !== repoRoot &&
  path.dirname(target) === path.dirname(repoRoot) &&
  path.basename(target).startsWith(`${path.basename(repoRoot)}-`);

export const approves = (payload, repoRoot, listed) => {
  if (payload.tool_name !== 'EnterWorktree' || typeof payload.tool_input?.path !== 'string') return false;
  const target = path.resolve(payload.tool_input.path);
  return listed.includes(target) && isCraftSibling(target, repoRoot);
};

const real = candidate => {
  try {
    return realpathSync(candidate);
  } catch {
    return path.resolve(candidate);
  }
};

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

const main = () => {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  if (payload.tool_name !== 'EnterWorktree') return;
  try {
    const commonDir = git(payload.cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
    const repoRoot = path.dirname(real(commonDir));
    const listed = worktreePaths(git(payload.cwd, ['worktree', 'list', '--porcelain'])).map(real);
    const resolved = { ...payload, tool_input: { ...payload.tool_input, path: real(payload.tool_input.path) } };
    if (approves(resolved, repoRoot, listed)) process.stdout.write(JSON.stringify(ALLOW));
  } catch (error) {
    process.stderr.write(`driver: worktree approver could not judge ${payload.tool_input?.path}: ${error.message}\n`);
  }
};

if (import.meta.main) main();
