#!/usr/bin/env node
// PreToolUse(Bash) hook for driven sessions: denies push, PR creation and merge unless they are
// pre-approved. Hard floor under craft's soft policy. Approval comes from DRIVER_PREAPPROVED, which
// the driver bakes into the hook command so the guarded session cannot edit it; DRIVER_BRIEF (a file
// the session can write) is the legacy tmux-driver source.
import { readFileSync } from 'node:fs';
import { parseShellCommands, basename } from '../../engine/src/guards/shell-tokeniser.js';
import { gitInvocations } from '../../engine/src/guards/shell-git-invocations.js';

const PREAPPROVED_LINE = /^PREAPPROVED:(.*)$/m;
const GH_PR_ACTIONS = new Map([['create', 'propose'], ['merge', 'integrate']]);
const UNPARSEABLE = 'driver: command not parseable and names push or gh — denied fail-closed';
// An unparseable command is denied only when it could hide an outward action.
const MAY_BE_OUTWARD = /\bpush\b|\bgh\b/;

const actionList = list => new Set(list.split(',').map(action => action.trim()).filter(Boolean));

export const approvedActions = brief => {
  const match = brief.match(PREAPPROVED_LINE);
  if (match === null) return new Set();
  return actionList(match[1]);
};

const ghActionOf = words => {
  const ghAt = words.findIndex(word => basename(word.text) === 'gh');
  if (ghAt < 0 || words[ghAt + 1]?.text !== 'pr') return null;
  return GH_PR_ACTIONS.get(words[ghAt + 2]?.text) ?? null;
};

const gitActionOf = invocation => {
  if (invocation.kind === 'indeterminate') return 'push';
  return invocation.kind === 'subcommand' && invocation.subcommand === 'push' ? 'push' : null;
};

const outwardActions = command => {
  const shell = parseShellCommands(command);
  const git = gitInvocations(command);
  if (!shell.parsed || !git.parsed) return null;
  return [...shell.commands.map(({ words }) => ghActionOf(words)), ...git.invocations.map(gitActionOf)].filter(Boolean);
};

export const judge = (command, approved) => {
  const actions = outwardActions(command);
  if (actions === null) return MAY_BE_OUTWARD.test(command) ? { block: true, reason: UNPARSEABLE } : { block: false };
  const missing = actions.find(action => !approved.has(action));
  if (missing === undefined) return { block: false };
  return { block: true, reason: `driver: '${missing}' is not pre-approved in the brief (PREAPPROVED: line)` };
};

export const approvalFrom = (env, readText) => {
  if (env.DRIVER_PREAPPROVED !== undefined) return actionList(env.DRIVER_PREAPPROVED);
  return env.DRIVER_BRIEF ? approvedActions(readText(env.DRIVER_BRIEF)) : new Set();
};

const readBrief = path => {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    process.stderr.write(`driver: cannot read DRIVER_BRIEF ${path}: ${error.message}\n`);
    return '';
  }
};

const deny = reason =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

const main = () => {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const command = payload.tool_input?.command ?? '';
  const approved = approvalFrom(process.env, readBrief);
  const verdict = judge(command, approved);
  if (verdict.block) process.stdout.write(deny(verdict.reason));
};

if (import.meta.main) main();
