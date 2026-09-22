'use strict';
// Shared setup for run-ledger.sh specs: a throwaway git checkout plus (optionally)
// a linked worktree, wired through the script's own open/move verbs — never by
// hand-crafting pointer/ledger files, so the fixture stays honest to the CLI it
// is testing.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const LEDGER_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'run-ledger.sh');
const LEDGER_HEADER = '# craft run record (append-only)';

function git(cwd, args) {
  return execFileSync(
    'git',
    ['-C', cwd, '-c', 'user.email=craft-run@example.com', '-c', 'user.name=craft-run', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

// The root is realpath'd for the same reason test/helpers/tmp-git-repo.js is:
// macOS `$TMPDIR` is itself a symlink, and the script under test compares its
// own physical `git rev-parse` output against this directory.
function createRunRepo() {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'craft-run-')));
  const main = path.join(parent, 'repo');
  fs.mkdirSync(main);
  git(main, ['init', '-q']);
  git(main, ['commit', '--allow-empty', '-q', '-m', 'init']);
  const cleanup = () => fs.rmSync(parent, { recursive: true, force: true });
  return { parent, main, cleanup };
}

function addWorktree(main, dirName = 'repo-demo', branch = 'feat/demo') {
  const worktreePath = path.join(path.dirname(main), dirName);
  git(main, ['worktree', 'add', '-q', '-b', branch, worktreePath]);
  return worktreePath;
}

function runLedger(cwd, args, input = '') {
  const result = spawnSync('bash', [LEDGER_SCRIPT, ...args], { cwd, input, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Mimics how a Bash call's stdout lands in a Claude transcript: one JSONL line
// per tool_result text.
function writeTranscript(dir, texts) {
  fs.mkdirSync(dir, { recursive: true });
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const lines = texts.map((text) =>
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: text }] } }),
  );
  fs.writeFileSync(transcriptPath, lines.join('\n') + '\n');
  return transcriptPath;
}

// Binds a run end to end through the script's own verbs (open, then move when
// a worktree is requested) so every fixture ledger is one the script itself
// produced. `ledgerLines` emulates an already-running session's prior records
// via a direct append — test setup, not the production write path (that path
// is `append`, exercised on its own).
function bindRun({ runId = 'demo', ledgerLines = [], worktree = true } = {}) {
  const { parent, main, cleanup } = createRunRepo();
  const openArgs = worktree ? ['open', runId] : ['open', runId, '--in-place'];
  const openResult = runLedger(main, openArgs);
  const [openKey, openTarget] = openResult.stdout.trim().split(' ');

  let worktreePath = null;
  let ledgerPath = openTarget;
  let runKey = openKey;
  if (worktree) {
    worktreePath = addWorktree(main);
    const moveResult = runLedger(main, ['move', runId, worktreePath]);
    const [movedKey, movedTarget] = moveResult.stdout.trim().split(' ');
    ledgerPath = movedTarget;
    runKey = movedKey;
  }

  for (const line of ledgerLines) {
    fs.appendFileSync(ledgerPath, `${line}\n`);
  }

  const transcriptPath = writeTranscript(parent, [openResult.stdout]);

  return { parent, main, worktree: worktreePath, ledgerPath, runKey, transcriptPath, cleanup };
}

module.exports = {
  LEDGER_SCRIPT,
  LEDGER_HEADER,
  createRunRepo,
  addWorktree,
  runLedger,
  writeTranscript,
  bindRun,
};
