'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  LEDGER_HEADER,
  createRunRepo,
  addWorktree,
  runLedger,
  writeTranscript,
  bindRun,
} = require('./helpers/craft-run');

const ROOT = path.join(__dirname, '..');

const RUN_KEY_PATTERN = /^demo@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// ---------------------------------------------------------------------------
// open
// ---------------------------------------------------------------------------

test('Given a fresh repo, when open demo runs from the checkout, then stdout carries the run-key and scratch, both holding exactly the header line', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    const [key, target] = result.stdout.trim().split(' ');
    assert.strictEqual(result.status, 0);
    assert.match(key, RUN_KEY_PATTERN);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), `${LEDGER_HEADER}\n`);
    const pointerPath = path.join(main, '.claude', 'craft-runs', 'demo.pointer');
    assert.strictEqual(fs.readFileSync(pointerPath, 'utf8'), `${key} ${target}\n`);
  } finally {
    cleanup();
  }
});

test('Given open --in-place on a fresh repo, when open runs, then no scratch exists and the pointer names the in-place record file', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['open', 'demo', '--in-place']);

    const [key, target] = result.stdout.trim().split(' ');
    assert.strictEqual(result.status, 0);
    assert.strictEqual(target, path.join(main, '.claude', 'craft-run-record.md'));
    assert.strictEqual(
      fs.existsSync(path.join(main, '.claude', 'craft-runs', 'demo.pre.md')),
      false,
      'no scratch file should exist for an in-place open',
    );
    assert.strictEqual(fs.readFileSync(target, 'utf8'), `${LEDGER_HEADER}\n`);
    const pointerPath = path.join(main, '.claude', 'craft-runs', 'demo.pointer');
    assert.strictEqual(fs.readFileSync(pointerPath, 'utf8'), `${key} ${target}\n`);
  } finally {
    cleanup();
  }
});

test('Given an existing in-place ledger with content, when open --in-place runs again, then the content is kept and no second header is added', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const targetDir = path.join(main, '.claude');
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, 'craft-run-record.md');
    fs.writeFileSync(targetPath, `${LEDGER_HEADER}\ndemo design r1\n`);

    const sut = runLedger;

    const result = sut(main, ['open', 'demo', '--in-place']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(fs.readFileSync(targetPath, 'utf8'), `${LEDGER_HEADER}\ndemo design r1\n`);
  } finally {
    cleanup();
  }
});

test('Given demo already open, when open demo runs again, then stderr names the replacement and exactly one demo.pointer exists', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'demo']);

    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.match(result.stderr, /replac/i);
    const runsDir = path.join(main, '.claude', 'craft-runs');
    const pointers = fs.readdirSync(runsDir).filter((f) => f.endsWith('.pointer'));
    assert.deepStrictEqual(pointers, ['demo.pointer']);
  } finally {
    cleanup();
  }
});

test('Given an invalid run-id, when open runs, then it exits 2', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['open', 'Bad_Id']);

    assert.strictEqual(result.status, 2);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// append
// ---------------------------------------------------------------------------

test('Given an open run, when append demo design runs from a subdirectory of a linked worktree with stdin holding a blank line, then the scratch gains both records in order and nothing for the blank line', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const openResult = runLedger(main, ['open', 'demo']);
    const [, scratch] = openResult.stdout.trim().split(' ');
    const worktreePath = addWorktree(main);
    const subDir = path.join(worktreePath, 'nested');
    fs.mkdirSync(subDir);

    const sut = runLedger;

    const result = sut(subDir, ['append', 'demo', 'design'], 'r1\n\nr2\n');

    assert.strictEqual(result.status, 0);
    assert.strictEqual(fs.readFileSync(scratch, 'utf8'), `${LEDGER_HEADER}\ndemo design r1\ndemo design r2\n`);
  } finally {
    cleanup();
  }
});

test('Given no pointer, when append runs, then exit 1 with a stderr reason', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['append', 'demo', 'design'], 'r1\n');

    assert.strictEqual(result.status, 1);
    assert.notStrictEqual(result.stderr.trim(), '');
  } finally {
    cleanup();
  }
});

test('Given all-blank stdin, when append runs on an open run, then exit 1', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'demo']);

    const sut = runLedger;

    const result = sut(main, ['append', 'demo', 'design'], '\n\n');

    assert.strictEqual(result.status, 1);
  } finally {
    cleanup();
  }
});

test('Given the ledger file deleted, when append runs, then exit 1 and the file is not recreated', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const openResult = runLedger(main, ['open', 'demo']);
    const [, scratch] = openResult.stdout.trim().split(' ');
    fs.rmSync(scratch);

    const sut = runLedger;

    const result = sut(main, ['append', 'demo', 'design'], 'r1\n');

    assert.strictEqual(result.status, 1);
    assert.strictEqual(fs.existsSync(scratch), false);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

test('Given a scratch with two records and a worktree ledger already holding the header, when move runs, then the worktree ledger holds the header then the two records in order, the scratch is gone, and the pointer names the worktree ledger with the unchanged run-key', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const openResult = runLedger(main, ['open', 'demo']);
    const [openKey, scratch] = openResult.stdout.trim().split(' ');
    runLedger(main, ['append', 'demo', 'design'], 'r1\nr2\n');
    const worktreePath = addWorktree(main);
    const worktreeLedger = path.join(worktreePath, '.claude', 'craft-run-record.md');
    fs.mkdirSync(path.dirname(worktreeLedger), { recursive: true });
    fs.writeFileSync(worktreeLedger, `${LEDGER_HEADER}\n`);

    const sut = runLedger;

    const result = sut(main, ['move', 'demo', worktreePath]);

    const [movedKey, target] = result.stdout.trim().split(' ');
    assert.strictEqual(result.status, 0);
    assert.strictEqual(target, worktreeLedger);
    assert.strictEqual(movedKey, openKey);
    assert.strictEqual(
      fs.readFileSync(worktreeLedger, 'utf8'),
      `${LEDGER_HEADER}\ndemo design r1\ndemo design r2\n`,
    );
    assert.strictEqual(fs.existsSync(scratch), false);
    const pointerPath = path.join(main, '.claude', 'craft-runs', 'demo.pointer');
    assert.strictEqual(fs.readFileSync(pointerPath, 'utf8'), `${openKey} ${worktreeLedger}\n`);
  } finally {
    cleanup();
  }
});

test('Given no worktree ledger, when move runs, then it creates the worktree ledger with the header', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'demo']);
    const worktreePath = addWorktree(main);

    const sut = runLedger;

    const result = sut(main, ['move', 'demo', worktreePath]);

    assert.strictEqual(result.status, 0);
    const worktreeLedger = path.join(worktreePath, '.claude', 'craft-run-record.md');
    assert.strictEqual(fs.readFileSync(worktreeLedger, 'utf8'), `${LEDGER_HEADER}\n`);
  } finally {
    cleanup();
  }
});

test('Given an --in-place run, when move runs, then it exits 1', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'demo', '--in-place']);
    const worktreePath = addWorktree(main);

    const sut = runLedger;

    const result = sut(main, ['move', 'demo', worktreePath]);

    assert.strictEqual(result.status, 1);
  } finally {
    cleanup();
  }
});

test('Given a worktree path that does not exist, when move runs, then it exits 1', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'demo']);

    const sut = runLedger;

    const result = sut(main, ['move', 'demo', path.join(main, 'no-such-worktree')]);

    assert.strictEqual(result.status, 1);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// locate --transcript
// ---------------------------------------------------------------------------

test('Given a transcript without the run-key, when locate --transcript runs, then stdout is empty and exit is 0', () => {
  const run = bindRun();
  try {
    const otherTranscript = writeTranscript(run.parent, ['nothing relevant here']);

    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', otherTranscript]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  } finally {
    run.cleanup();
  }
});

test('Given a transcript with the run-key, when locate --transcript runs, then stdout names the run-id and ledger', () => {
  const run = bindRun();
  try {
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', run.transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), `demo ${run.ledgerPath}`);
  } finally {
    run.cleanup();
  }
});

test('Given a bound run, when locate --transcript runs from the main checkout and from the worktree, then both return the same answer', () => {
  const run = bindRun();
  try {
    const sut = runLedger;

    const fromMain = sut(run.main, ['locate', '--transcript', run.transcriptPath]);
    const fromWorktree = sut(run.worktree, ['locate', '--transcript', run.transcriptPath]);

    assert.strictEqual(fromMain.stdout, fromWorktree.stdout);
    assert.strictEqual(fromMain.stdout.trim(), `demo ${run.ledgerPath}`);
  } finally {
    run.cleanup();
  }
});

test('Given two pointers with keys a@2026-01-01 and b@2026-01-02 both present in the transcript, when locate --transcript runs, then the newest run-key wins', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const runsDir = path.join(main, '.claude', 'craft-runs');
    fs.mkdirSync(runsDir, { recursive: true });
    const ledgerA = path.join(runsDir, 'a.pre.md');
    const ledgerB = path.join(runsDir, 'b.pre.md');
    fs.writeFileSync(ledgerA, `${LEDGER_HEADER}\n`);
    fs.writeFileSync(ledgerB, `${LEDGER_HEADER}\n`);
    fs.writeFileSync(path.join(runsDir, 'a.pointer'), `a@2026-01-01T00:00:00Z ${ledgerA}\n`);
    fs.writeFileSync(path.join(runsDir, 'b.pointer'), `b@2026-01-02T00:00:00Z ${ledgerB}\n`);
    const transcriptPath = writeTranscript(main, ['a@2026-01-01T00:00:00Z', 'b@2026-01-02T00:00:00Z']);

    const sut = runLedger;

    const result = sut(main, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.stdout.trim(), `b ${ledgerB}`);
  } finally {
    cleanup();
  }
});

test('Given the alphabetically-first pointer holds the newer key, when locate --transcript scans a later, older-keyed pointer, then the newer key still wins without aborting the scan', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const runsDir = path.join(main, '.claude', 'craft-runs');
    fs.mkdirSync(runsDir, { recursive: true });
    const ledgerA = path.join(runsDir, 'a.pre.md');
    const ledgerZ = path.join(runsDir, 'z.pre.md');
    fs.writeFileSync(ledgerA, `${LEDGER_HEADER}\n`);
    fs.writeFileSync(ledgerZ, `${LEDGER_HEADER}\n`);
    fs.writeFileSync(path.join(runsDir, 'a.pointer'), `a@2026-02-01T00:00:00Z ${ledgerA}\n`);
    fs.writeFileSync(path.join(runsDir, 'z.pointer'), `z@2026-01-01T00:00:00Z ${ledgerZ}\n`);
    const transcriptPath = writeTranscript(main, ['a@2026-02-01T00:00:00Z', 'z@2026-01-01T00:00:00Z']);

    const sut = runLedger;

    const result = sut(main, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), `a ${ledgerA}`);
  } finally {
    cleanup();
  }
});

test('Given a missing transcript file, when locate --transcript runs, then stdout is empty and exit is 0', () => {
  const run = bindRun();
  try {
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', path.join(run.parent, 'no-such-file.jsonl')]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  } finally {
    run.cleanup();
  }
});

test('Given a non-git cwd, when locate --transcript runs, then stdout is empty, exit is 0, and stderr is empty', () => {
  const run = bindRun();
  const nonGitDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'craft-non-git-'));
  try {
    const sut = runLedger;

    const result = sut(nonGitDir, ['locate', '--transcript', run.transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
  } finally {
    fs.rmSync(nonGitDir, { recursive: true, force: true });
    run.cleanup();
  }
});

test('Given the ledger deleted, when locate --transcript runs, then stdout is empty', () => {
  const run = bindRun();
  try {
    fs.rmSync(run.ledgerPath);

    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', run.transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  } finally {
    run.cleanup();
  }
});

// ---------------------------------------------------------------------------
// locate --run
// ---------------------------------------------------------------------------

test('Given a run opened normally, when locate --run demo runs, then it returns the pair', () => {
  const run = bindRun();
  try {
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--run', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout.trim(), `demo ${run.ledgerPath}`);
  } finally {
    run.cleanup();
  }
});

// ---------------------------------------------------------------------------
// sweep (inside open)
// ---------------------------------------------------------------------------

test('Given one pointer whose ledger is missing and one live pointer, when open runs for a third run-id, then the stale pointer is removed and the live one kept', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'alive']);
    const runsDir = path.join(main, '.claude', 'craft-runs');
    fs.writeFileSync(path.join(runsDir, 'stale.pointer'), `stale@2026-01-01T00:00:00Z ${path.join(runsDir, 'missing.pre.md')}\n`);
    const sut = runLedger;

    sut(main, ['open', 'third']);

    const pointers = fs.readdirSync(runsDir).filter((f) => f.endsWith('.pointer')).sort();
    assert.deepStrictEqual(pointers, ['alive.pointer', 'third.pointer']);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// close
// ---------------------------------------------------------------------------

test('Given an open run with a delta file, when close demo runs, then the pointer, scratch and delta are all removed', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const openResult = runLedger(main, ['open', 'demo']);
    const [, scratch] = openResult.stdout.trim().split(' ');
    const runsDir = path.join(main, '.claude', 'craft-runs');
    const deltaPath = path.join(runsDir, 'demo.delta.json');
    fs.writeFileSync(deltaPath, '{}');

    const sut = runLedger;

    const result = sut(main, ['close', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(fs.existsSync(path.join(runsDir, 'demo.pointer')), false);
    assert.strictEqual(fs.existsSync(scratch), false);
    assert.strictEqual(fs.existsSync(deltaPath), false);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// dir
// ---------------------------------------------------------------------------

test('Given a run opened normally, when dir runs from the checkout and from the worktree, then both print the same craft-runs directory', () => {
  const run = bindRun();
  try {
    const sut = runLedger;

    const fromMain = sut(run.main, ['dir']);
    const fromWorktree = sut(run.worktree, ['dir']);

    const expected = path.join(run.main, '.claude', 'craft-runs');
    assert.strictEqual(fromMain.stdout.trim(), expected);
    assert.strictEqual(fromWorktree.stdout.trim(), expected);
  } finally {
    run.cleanup();
  }
});

test('Given a non-git cwd, when dir runs, then it exits 1', () => {
  const nonGitDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'craft-non-git-'));
  try {
    const sut = runLedger;

    const result = sut(nonGitDir, ['dir']);

    assert.strictEqual(result.status, 1);
  } finally {
    fs.rmSync(nonGitDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// usage
// ---------------------------------------------------------------------------

test('Given no verb, when the script runs, then it exits 2', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, []);

    assert.strictEqual(result.status, 2);
  } finally {
    cleanup();
  }
});

test('Given an unknown verb, when the script runs, then it exits 2', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['bogus']);

    assert.strictEqual(result.status, 2);
  } finally {
    cleanup();
  }
});

test('Given locate with no flag, when the script runs, then it exits 2', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['locate']);

    assert.strictEqual(result.status, 2);
  } finally {
    cleanup();
  }
});

test('Given append with a bad phase Bad, when the script runs, then it exits 2', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'demo']);

    const sut = runLedger;

    const result = sut(main, ['append', 'demo', 'Bad'], 'r1\n');

    assert.strictEqual(result.status, 2);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// ignore posture
// ---------------------------------------------------------------------------

test('Given this repository, when git check-ignore runs on .claude/craft-runs/demo.pointer at the repo root, then it exits 0', () => {
  const sut = () =>
    execFileSync('git', ['check-ignore', '-q', '.claude/craft-runs/demo.pointer'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

  assert.doesNotThrow(sut);
});

// ---------------------------------------------------------------------------
// trust — a cloned repository can commit files under .claude/, so nothing a
// pointer or ledger path names is taken on faith
// ---------------------------------------------------------------------------

const PAST_STAMP = '2026-01-01T00:00:00Z';

function gitIn(cwd, args) {
  return execFileSync(
    'git',
    ['-C', cwd, '-c', 'user.email=craft-run@example.com', '-c', 'user.name=craft-run', ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

// Plants a pointer by hand, the way a hostile clone would ship one, with a
// ledger that holds the header, and a transcript that carries the key.
function plantPointer(main, { name, key, ledger }) {
  const runsDir = path.join(main, '.claude', 'craft-runs');
  fs.mkdirSync(runsDir, { recursive: true });
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.writeFileSync(ledger, `${LEDGER_HEADER}\n`);
  const pointerPath = path.join(runsDir, `${name}.pointer`);
  fs.writeFileSync(pointerPath, `${key} ${ledger}\n`);
  const transcriptPath = writeTranscript(path.join(main, '..', 'transcript-dir'), [key]);
  return { runsDir, pointerPath, transcriptPath };
}

const UNTRUSTED_POINTERS = [
  {
    label: 'a key with no timestamp',
    pointer: (main) => ({ name: 'demo', key: 'demo', ledger: path.join(main, '.claude', 'craft-runs', 'demo.pre.md') }),
  },
  {
    label: 'a key whose run-id is not its file name',
    pointer: (main) => ({ name: 'demo', key: `other@${PAST_STAMP}`, ledger: path.join(main, '.claude', 'craft-runs', 'demo.pre.md') }),
  },
  {
    label: 'a ledger outside the run scratch and every worktree record',
    pointer: (main) => ({ name: 'demo', key: `demo@${PAST_STAMP}`, ledger: path.join(main, '.claude', 'notes.md') }),
  },
  {
    label: 'a relative ledger path',
    pointer: () => ({ name: 'demo', key: `demo@${PAST_STAMP}`, ledger: '.claude/craft-runs/demo.pre.md' }),
  },
  {
    label: 'a key stamped in the future',
    pointer: (main) => ({ name: 'demo', key: 'demo@2999-01-01T00:00:00Z', ledger: path.join(main, '.claude', 'craft-runs', 'demo.pre.md') }),
  },
];

for (const { label, pointer } of UNTRUSTED_POINTERS) {
  test(`Given a planted pointer with ${label}, when locate --transcript runs on a transcript holding its key, then nothing is bound`, () => {
    const { main, cleanup } = createRunRepo();
    try {
      const spec = pointer(main);
      const ledger = path.isAbsolute(spec.ledger) ? spec.ledger : path.join(main, spec.ledger);
      const { transcriptPath } = plantPointer(main, { ...spec, ledger });
      if (!path.isAbsolute(spec.ledger)) {
        fs.writeFileSync(path.join(main, '.claude', 'craft-runs', 'demo.pointer'), `${spec.key} ${spec.ledger}\n`);
      }
      const sut = runLedger;

      const result = sut(main, ['locate', '--transcript', transcriptPath]);

      assert.strictEqual(result.status, 0);
      assert.strictEqual(result.stdout, '');
    } finally {
      cleanup();
    }
  });
}

test('Given a git-tracked pointer naming its own scratch, when locate --transcript runs and open sweeps, then it is neither bound nor deleted', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const ledger = path.join(main, '.claude', 'craft-runs', 'demo.pre.md');
    const { pointerPath, transcriptPath } = plantPointer(main, { name: 'demo', key: `demo@${PAST_STAMP}`, ledger });
    fs.rmSync(ledger);
    gitIn(main, ['add', '-f', pointerPath]);
    gitIn(main, ['commit', '-q', '-m', 'planted']);
    fs.writeFileSync(ledger, `${LEDGER_HEADER}\n`);
    const sut = runLedger;

    const located = sut(main, ['locate', '--transcript', transcriptPath]);
    fs.rmSync(ledger);
    sut(main, ['open', 'third']);

    assert.strictEqual(located.stdout, '');
    assert.strictEqual(fs.existsSync(pointerPath), true, 'a tracked pointer is never swept');
  } finally {
    cleanup();
  }
});

test('Given the scratch path is a symlink to a file outside the repository, when open runs, then it exits 1 and the outside file is unchanged', () => {
  const { parent, main, cleanup } = createRunRepo();
  try {
    const outside = path.join(parent, 'outside.txt');
    fs.writeFileSync(outside, 'untouched\n');
    const runsDir = path.join(main, '.claude', 'craft-runs');
    fs.mkdirSync(runsDir, { recursive: true });
    fs.symlinkSync(outside, path.join(runsDir, 'demo.pre.md'));
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /symlink/);
    assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'untouched\n');
  } finally {
    cleanup();
  }
});

test('Given the in-place record is a symlink to a file outside the repository, when open --in-place runs, then it exits 1 and the outside file is unchanged', () => {
  const { parent, main, cleanup } = createRunRepo();
  try {
    const outside = path.join(parent, 'outside.txt');
    fs.writeFileSync(outside, 'untouched\n');
    fs.mkdirSync(path.join(main, '.claude'), { recursive: true });
    fs.symlinkSync(outside, path.join(main, '.claude', 'craft-run-record.md'));
    const sut = runLedger;

    const result = sut(main, ['open', 'demo', '--in-place']);

    assert.strictEqual(result.status, 1);
    assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'untouched\n');
  } finally {
    cleanup();
  }
});

test('Given the .claude directory is a symlink out of the repository, when open runs, then it exits 1 and writes nothing there', () => {
  const { parent, main, cleanup } = createRunRepo();
  try {
    const elsewhere = path.join(parent, 'elsewhere');
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, path.join(main, '.claude'));
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 1);
    assert.deepStrictEqual(fs.readdirSync(elsewhere), []);
  } finally {
    cleanup();
  }
});

test('Given a git-tracked in-place record, when open --in-place runs, then it exits 1 and the record is unchanged', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const record = path.join(main, '.claude', 'craft-run-record.md');
    fs.mkdirSync(path.dirname(record), { recursive: true });
    fs.writeFileSync(record, 'demo resolve RESOLVE: --skip review\n');
    gitIn(main, ['add', '-f', record]);
    gitIn(main, ['commit', '-q', '-m', 'seeded record']);
    const sut = runLedger;

    const result = sut(main, ['open', 'demo', '--in-place']);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /git-tracked/);
    assert.strictEqual(fs.readFileSync(record, 'utf8'), 'demo resolve RESOLVE: --skip review\n');
  } finally {
    cleanup();
  }
});

test('Given a scratch left non-empty by a crashed attempt of the same run-id, when open runs again, then the scratch holds only the header', () => {
  const { main, cleanup } = createRunRepo();
  try {
    runLedger(main, ['open', 'demo']);
    runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: --skip review\n');
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    const [, scratch] = result.stdout.trim().split(' ');
    assert.strictEqual(fs.readFileSync(scratch, 'utf8'), `${LEDGER_HEADER}\n`);
  } finally {
    cleanup();
  }
});

test('Given a run-id carrying a newline, when open runs, then it exits 2 and creates nothing under craft-runs', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['open', 'nl\nBAD ID/x']);

    assert.strictEqual(result.status, 2);
    assert.strictEqual(fs.existsSync(path.join(main, '.claude', 'craft-runs')), false);
  } finally {
    cleanup();
  }
});

test('Given a phase carrying a newline, when append runs, then it exits 2 and the ledger gains nothing', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const [, scratch] = runLedger(main, ['open', 'demo']).stdout.trim().split(' ');
    const sut = runLedger;

    const result = sut(main, ['append', 'demo', 'design\nother'], 'forged\n');

    assert.strictEqual(result.status, 2);
    assert.strictEqual(fs.readFileSync(scratch, 'utf8'), `${LEDGER_HEADER}\n`);
  } finally {
    cleanup();
  }
});

test('Given a misspelt in-place flag, when open runs, then it exits 2 and opens nothing', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['open', 'demo', '--inplace']);

    assert.strictEqual(result.status, 2);
    assert.strictEqual(fs.existsSync(path.join(main, '.claude', 'craft-runs', 'demo.pointer')), false);
  } finally {
    cleanup();
  }
});

test('Given a directory that is not a worktree of the repository, when move runs, then it exits 1 and the scratch stays', () => {
  const { parent, main, cleanup } = createRunRepo();
  try {
    const [, scratch] = runLedger(main, ['open', 'demo']).stdout.trim().split(' ');
    const stranger = path.join(parent, 'stranger');
    fs.mkdirSync(stranger);
    const sut = runLedger;

    const result = sut(main, ['move', 'demo', stranger]);

    assert.strictEqual(result.status, 1);
    assert.strictEqual(fs.existsSync(scratch), true);
    assert.strictEqual(fs.existsSync(path.join(stranger, '.claude')), false);
  } finally {
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// snapshot
// ---------------------------------------------------------------------------

test('Given a worktree ledger holding two runs, when snapshot demo runs, then the final file beside the pointer holds only demo lines and close removes it', () => {
  const run = bindRun({ ledgerLines: ['demo design PHASE-START(design): 2026-09-22T10:00:00Z', 'other design stray'] });
  try {
    const sut = runLedger;

    const result = sut(run.main, ['snapshot', 'demo']);
    const finalPath = result.stdout.trim();
    const snapshot = fs.readFileSync(finalPath, 'utf8');
    runLedger(run.main, ['close', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(finalPath, path.join(run.main, '.claude', 'craft-runs', 'demo.final.md'));
    assert.strictEqual(snapshot, 'demo design PHASE-START(design): 2026-09-22T10:00:00Z\n');
    assert.strictEqual(fs.existsSync(finalPath), false);
  } finally {
    run.cleanup();
  }
});

// ---------------------------------------------------------------------------
// locate --run edges and the sweep's malformed-pointer branch
// ---------------------------------------------------------------------------

test('Given no pointer for the run-id, when locate --run runs, then stdout is empty and exit is 0', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['locate', '--run', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  } finally {
    cleanup();
  }
});

test('Given a torn-down ledger, when locate --run runs, then stdout is empty and exit is 0', () => {
  const run = bindRun();
  try {
    fs.rmSync(run.ledgerPath);
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--run', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  } finally {
    run.cleanup();
  }
});

test('Given an invalid run-id, when locate --run runs, then it exits 2', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const sut = runLedger;

    const result = sut(main, ['locate', '--run', 'Bad_Id']);

    assert.strictEqual(result.status, 2);
  } finally {
    cleanup();
  }
});

test('Given a pointer whose line has no space, when open runs for another run-id, then the malformed pointer is swept', () => {
  const { main, cleanup } = createRunRepo();
  try {
    const runsDir = path.join(main, '.claude', 'craft-runs');
    fs.mkdirSync(runsDir, { recursive: true });
    fs.writeFileSync(path.join(runsDir, 'broken.pointer'), 'no-space-here\n');
    const sut = runLedger;

    sut(main, ['open', 'demo']);

    assert.strictEqual(fs.existsSync(path.join(runsDir, 'broken.pointer')), false);
  } finally {
    cleanup();
  }
});
