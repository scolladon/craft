'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  LEDGER_SCRIPT,
  LEDGER_HEADER,
  git,
  runsDirOf,
  createRunRepo,
  runLedger,
  writeTranscript,
  bindRun,
} = require('./helpers/craft-run');

const RUN_KEY_PATTERN = /^demo@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const PAST_STAMP = '2026-01-01T00:00:00Z';

const ledgerOf = (main, runId = 'demo') => path.join(runsDirOf(main), `${runId}.md`);
const pointerOf = (main, runId = 'demo') => path.join(runsDirOf(main), `${runId}.pointer`);

function withTempDir(prefix, act) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  try {
    return act(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function withRepo(act) {
  const repo = createRunRepo();
  try {
    return act(repo);
  } finally {
    repo.cleanup();
  }
}

function withRun(options, act) {
  const run = bindRun(options);
  try {
    return act(run);
  } finally {
    run.cleanup();
  }
}

// ---------------------------------------------------------------------------
// open
// ---------------------------------------------------------------------------

test('Given a fresh repo, when open demo runs from the checkout, then stdout carries the run-key and the ledger, the ledger holds the header and the pointer names both', () => {
  withRepo(({ main }) => {
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    const [key, ledger] = result.stdout.trim().split(' ');
    assert.strictEqual(result.status, 0);
    assert.match(key, RUN_KEY_PATTERN);
    assert.strictEqual(ledger, ledgerOf(main));
    assert.strictEqual(fs.readFileSync(ledger, 'utf8'), `${LEDGER_HEADER}\n`);
    assert.strictEqual(fs.readFileSync(pointerOf(main), 'utf8'), `${key} ${ledger}\n`);
  });
});

test('Given a run opened and a worktree added, when git status runs in both trees with ignored files shown, then neither holds any run file', () => {
  withRun({}, (run) => {
    const sut = (cwd) => git(cwd, ['status', '--porcelain', '--untracked-files=all', '--ignored']);

    const fromMain = sut(run.main);
    const fromWorktree = sut(run.worktree);

    assert.ok(fs.existsSync(pointerOf(run.main)) && fs.existsSync(run.ledgerPath), 'the run files exist');
    assert.strictEqual(fromMain, '');
    assert.strictEqual(fromWorktree, '');
  });
});

test('Given demo already open with records, when open demo runs again, then it exits 3 with an empty stdout, leaves the ledger and the pointer byte-identical and names the run-id, its open-since stamp and the ledger on one stderr line without the run-key', () => {
  withRepo(({ main }) => {
    runLedger(main, ['open', 'demo']);
    runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: --skip review\n');
    const ledgerBefore = fs.readFileSync(ledgerOf(main), 'utf8');
    const pointerBefore = fs.readFileSync(pointerOf(main), 'utf8');
    const since = pointerBefore.split(' ')[0].slice('demo@'.length);
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 3);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), ledgerBefore);
    assert.strictEqual(fs.readFileSync(pointerOf(main), 'utf8'), pointerBefore);
    assert.strictEqual(
      result.stderr,
      `run-ledger: open: run-id demo is already open since ${since} (ledger ${ledgerOf(main)}); refusing to discard it\n`,
    );
    assert.doesNotMatch(result.stderr, /demo@/);
  });
});

test("Given a bound run and a second session whose transcript holds only a refused open's output, when locate --transcript runs on that transcript, then no run is bound", () => {
  withRun({}, (run) => {
    const refused = runLedger(run.main, ['open', 'demo']);
    const transcriptPath = writeTranscript(path.join(run.parent, 'second-session'), [refused.stdout, refused.stderr]);
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given demo already open with records, when the open-and-append chain of a second run runs, then the append never runs and the ledger keeps only its own records', () => {
  withRepo(({ main }) => {
    runLedger(main, ['open', 'demo']);
    runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: none\n');
    const before = fs.readFileSync(ledgerOf(main), 'utf8');
    const chain = '"$LEDGER" open demo && "$LEDGER" append demo resolve <<\'EOF\'\nRESOLVE: --skip review\nEOF\n';
    const sut = (cwd) => spawnSync('bash', ['-c', chain], { cwd, env: { ...process.env, LEDGER: LEDGER_SCRIPT }, encoding: 'utf8' });

    const result = sut(main);

    if (result.error) throw result.error;
    assert.strictEqual(result.status, 3);
    assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), before);
  });
});

test('Given demo closed after records were appended, when open demo runs, then it exits 0 and the ledger holds the header alone', () => {
  withRepo(({ main }) => {
    runLedger(main, ['open', 'demo']);
    runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: none\n');
    runLedger(main, ['close', 'demo']);
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.match(result.stdout.split(' ')[0], RUN_KEY_PATTERN);
    assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), `${LEDGER_HEADER}\n`);
  });
});

// Leftovers no run can append through: open replaces each and starts a fresh ledger.
const REPLACEABLE_LEFTOVERS = [
  {
    label: 'a pointer whose ledger was deleted',
    arrange: (main) => {
      runLedger(main, ['open', 'demo']);
      fs.rmSync(ledgerOf(main));
    },
    stderr: /^$/,
  },
  {
    label: 'a ledger holding records with no pointer',
    arrange: (main) => {
      runLedger(main, ['open', 'demo']);
      runLedger(main, ['append', 'demo', 'resolve'], 'RESOLVE: none\n');
      fs.rmSync(pointerOf(main));
    },
    stderr: /^$/,
  },
  {
    label: 'a pointer stamped in the future beside a ledger holding records',
    arrange: (main) => {
      fs.mkdirSync(runsDirOf(main), { recursive: true });
      fs.writeFileSync(ledgerOf(main), `${LEDGER_HEADER}\ndemo resolve RESOLVE: none\n`);
      fs.writeFileSync(pointerOf(main), `demo@2099-01-01T00:00:00Z ${ledgerOf(main)}\n`);
    },
    stderr: /^run-ledger: open: replacing existing pointer for run-id demo\n$/,
  },
];

for (const { label, arrange, stderr } of REPLACEABLE_LEFTOVERS) {
  test(`Given ${label}, when open demo runs, then it exits 0, the ledger holds the header alone and the pointer names a fresh run-key`, () => {
    withRepo(({ main }) => {
      arrange(main);
      const sut = runLedger;

      const result = sut(main, ['open', 'demo']);

      const [key] = result.stdout.trim().split(' ');
      assert.strictEqual(result.status, 0);
      assert.match(result.stderr, stderr);
      assert.match(key, RUN_KEY_PATTERN);
      assert.strictEqual(fs.readFileSync(ledgerOf(main), 'utf8'), `${LEDGER_HEADER}\n`);
      assert.strictEqual(fs.readFileSync(pointerOf(main), 'utf8'), `${key} ${ledgerOf(main)}\n`);
    });
  });
}

for (const [label, args, status] of [
  ['an invalid run-id', ['open', 'Bad_Id'], 2],
  ['a run-id carrying a newline', ['open', 'nl\nBAD ID/x'], 2],
  ['an extra argument', ['open', 'demo', '--in-place'], 2],
]) {
  test(`Given ${label}, when open runs, then it exits ${status} and creates no run directory`, () => {
    withRepo(({ main }) => {
      const sut = runLedger;

      const result = sut(main, args);

      assert.strictEqual(result.status, status);
      assert.strictEqual(fs.existsSync(runsDirOf(main)), false);
    });
  });
}

test('Given a cwd inside a committed directory laid out like a bare repository, when open runs, then it exits 1 and writes nothing there', () => {
  withRepo(({ main }) => {
    const bare = path.join(main, 'vendor', 'x');
    for (const dir of ['objects', 'refs']) fs.mkdirSync(path.join(bare, dir), { recursive: true });
    fs.writeFileSync(path.join(bare, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(bare, 'config'), '[core]\n\tbare = true\n');
    const sut = runLedger;

    const result = sut(bare, ['open', 'demo']);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /not inside a git repository's work tree/);
    assert.strictEqual(fs.existsSync(path.join(bare, 'craft-runs')), false);
  });
});

test('Given the run directory is a symlink out of the git dir, when open runs, then it exits 1 and writes nothing there', () => {
  withRepo(({ parent, main }) => {
    const elsewhere = path.join(parent, 'elsewhere');
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, runsDirOf(main));
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /symlinked run directory/);
    assert.deepStrictEqual(fs.readdirSync(elsewhere), []);
  });
});

// A committed directory laid out like a bare repository whose own config claims
// the enclosing tree as its work tree, and optionally forwards its common dir.
function plantBareLayout(main, { worktree = true, commondir = null } = {}) {
  const layout = (dir, config) => {
    for (const sub of ['objects', 'refs']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.writeFileSync(path.join(dir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(dir, 'config'), config);
  };
  const bare = path.join(main, 'vendor', 'x');
  layout(bare, `[core]\n\trepositoryformatversion = 0\n\tbare = false\n${worktree ? '\tworktree = ..\n' : ''}`);
  if (commondir) {
    layout(path.join(bare, commondir), '[core]\n\tbare = true\n');
    fs.writeFileSync(path.join(bare, 'commondir'), `${commondir}\n`);
  }
  return bare;
}

for (const [label, options] of [
  ['whose config claims a work tree', { worktree: true }],
  ['whose commondir forwards to another committed directory', { worktree: true, commondir: '../y' }],
]) {
  test(`Given a cwd inside a committed bare-repository layout ${label}, when open runs, then no run file lands anywhere in the working tree`, () => {
    withRepo(({ main }) => {
      const bare = plantBareLayout(main, options);
      const sut = runLedger;

      sut(bare, ['open', 'demo']);

      const status = git(main, ['status', '--porcelain', '--untracked-files=all', '--ignored']);
      assert.strictEqual(status.includes('craft-runs'), false, status);
      assert.strictEqual(fs.existsSync(path.join(main, 'vendor', 'x', 'craft-runs')), false);
    });
  });
}

test('Given a bare repository holding its worktrees in one container, when open runs from the container, then the ledger lands in the bare git dir', () => {
  withRepo(({ parent, main }) => {
    const container = path.join(parent, 'proj');
    fs.mkdirSync(container);
    git(parent, ['clone', '-q', '--bare', main, path.join(container, '.bare')]);
    fs.writeFileSync(path.join(container, '.git'), 'gitdir: ./.bare\n');
    const sut = runLedger;

    const result = sut(container, ['open', 'demo']);

    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim().split(' ')[1], path.join(container, '.bare', 'craft-runs', 'demo.md'));
  });
});

test('Given the run ledger path is a symlink to a file outside the git dir, when open runs, then it exits 1 and the outside file is unchanged', () => {
  withRepo(({ parent, main }) => {
    const outside = path.join(parent, 'outside.md');
    fs.writeFileSync(outside, '');
    fs.mkdirSync(runsDirOf(main), { recursive: true });
    fs.symlinkSync(outside, ledgerOf(main));
    const sut = runLedger;

    const result = sut(main, ['open', 'demo']);

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /symlinked or directory run file/);
    assert.strictEqual(fs.readFileSync(outside, 'utf8'), '');
    assert.deepStrictEqual(fs.readdirSync(parent).filter((f) => f.startsWith('.craft-run-ledger')), []);
  });
});

// ---------------------------------------------------------------------------
// append
// ---------------------------------------------------------------------------

test('Given an open run, when append demo design runs from a subdirectory of a linked worktree with stdin holding a blank line, then the ledger gains both records in order and nothing for the blank line', () => {
  withRun({}, (run) => {
    const subdir = path.join(run.worktree, 'nested');
    fs.mkdirSync(subdir);
    const sut = runLedger;

    const result = sut(subdir, ['append', 'demo', 'design'], 'r1\n\nr2\n');

    assert.strictEqual(result.status, 0);
    assert.strictEqual(fs.readFileSync(run.ledgerPath, 'utf8'), `${LEDGER_HEADER}\ndemo design r1\ndemo design r2\n`);
  });
});

const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const STAMPED_PHASE_START = /^demo design PHASE-START\(design\): (\S+)$/;
const utcNowSeconds = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const ledgerRecordsOf = (ledgerPath) => fs.readFileSync(ledgerPath, 'utf8').split('\n').slice(1, -1);

function assertStampedBetween(record, before, after) {
  const match = record.match(STAMPED_PHASE_START);
  assert.ok(match, `expected a stamped PHASE-START line, got ${record}`);
  assert.match(match[1], ISO_SECOND);
  assert.ok(before <= match[1] && match[1] <= after, `expected ${match[1]} within [${before}, ${after}]`);
}

test('Given an open run, when append receives PHASE-START(design): with no time, then the ledger line carries a UTC stamp taken between the call start and end', () => {
  withRun({ worktree: false }, (run) => {
    const sut = runLedger;
    const before = utcNowSeconds();

    const result = sut(run.main, ['append', 'demo', 'design'], 'PHASE-START(design):\n');

    const after = utcNowSeconds();
    assert.strictEqual(result.status, 0);
    const records = ledgerRecordsOf(run.ledgerPath);
    assert.strictEqual(records.length, 1);
    assertStampedBetween(records[0], before, after);
    assert.strictEqual(result.stderr, '');
  });
});

test('Given an open run, when append receives PHASE-START(design): with a supplied time, then the written time comes from the script and stderr names the replacement', () => {
  withRun({ worktree: false }, (run) => {
    const sut = runLedger;
    const before = utcNowSeconds();

    const result = sut(run.main, ['append', 'demo', 'design'], 'PHASE-START(design): 2000-01-01T00:00:00Z\n');

    const after = utcNowSeconds();
    assert.strictEqual(result.status, 0);
    const records = ledgerRecordsOf(run.ledgerPath);
    assertStampedBetween(records[0], before, after);
    assert.ok(!records[0].includes('2000-01-01'));
    assert.match(result.stderr, /replaced a supplied PHASE-START time/);
  });
});

test('Given an open run, when append receives a PHASE-START whose tail holds spaces, then the whole tail is replaced by one stamp', () => {
  withRun({ worktree: false }, (run) => {
    const sut = runLedger;
    const before = utcNowSeconds();

    const result = sut(run.main, ['append', 'demo', 'design'], 'PHASE-START(design): 15:10:00Z soon\n');

    const after = utcNowSeconds();
    assert.strictEqual(result.status, 0);
    assertStampedBetween(ledgerRecordsOf(run.ledgerPath)[0], before, after);
    assert.match(result.stderr, /replaced a supplied PHASE-START time/);
  });
});

test('Given an open run, when append receives PHASE-START(design): followed only by spaces, then the line is stamped and stderr stays silent', () => {
  withRun({ worktree: false }, (run) => {
    const sut = runLedger;
    const before = utcNowSeconds();

    const result = sut(run.main, ['append', 'demo', 'design'], 'PHASE-START(design):  \n');

    const after = utcNowSeconds();
    assert.strictEqual(result.status, 0);
    assertStampedBetween(ledgerRecordsOf(run.ledgerPath)[0], before, after);
    assert.strictEqual(result.stderr, '');
  });
});

test('Given a date earlier on PATH that prints a fixed future time, when append stamps a PHASE-START, then the stamp comes from the system clock instead', () => {
  withRun({ worktree: false }, (run) => {
    const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-date-shim-'));
    fs.writeFileSync(path.join(shimDir, 'date'), '#!/bin/sh\necho 2099-01-01T00:00:00Z\n', { mode: 0o755 });
    const sut = (input) => spawnSync('bash', [LEDGER_SCRIPT, 'append', 'demo', 'design'], {
      cwd: run.main,
      input,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env.PATH}` },
    });
    const before = utcNowSeconds();

    const result = sut('PHASE-START(design):\n');

    const after = utcNowSeconds();
    fs.rmSync(shimDir, { recursive: true, force: true });
    assert.strictEqual(result.status, 0);
    assertStampedBetween(ledgerRecordsOf(run.ledgerPath)[0], before, after);
  });
});

test('Given a batch mixing a RESOLVE line and a PHASE-START line, when append runs, then only the PHASE-START line is stamped and the order is kept', () => {
  withRun({ worktree: false }, (run) => {
    const sut = runLedger;
    const before = utcNowSeconds();

    sut(run.main, ['append', 'demo', 'design'], 'RESOLVE: none\nPHASE-START(design):\n');

    const after = utcNowSeconds();
    const records = ledgerRecordsOf(run.ledgerPath);
    assert.strictEqual(records.length, 2);
    assert.strictEqual(records[0], 'demo design RESOLVE: none');
    assertStampedBetween(records[1], before, after);
  });
});

test('Given an open run, when append receives a malformed PHASE-START, a bad phase id, a PHASE-DONE and a HARNESS-BG, then each is written verbatim', () => {
  withRun({ worktree: false }, (run) => {
    const sut = runLedger;
    const lines = ['PHASE-START(design):x', 'PHASE-START(Bad):', 'PHASE-DONE(design): ok', 'HARNESS-BG(validation:fuzz): pid=1 out=o spec=none'];

    const result = sut(run.main, ['append', 'demo', 'design'], `${lines.join('\n')}\n`);

    assert.deepStrictEqual(ledgerRecordsOf(run.ledgerPath), lines.map((line) => `demo design ${line}`));
    assert.strictEqual(result.stderr, '');
  });
});

test('Given no pointer, when append runs, then it exits 1 with a stderr reason', () => {
  withRepo(({ main }) => {
    const sut = runLedger;

    const result = sut(main, ['append', 'demo', 'design'], 'r1\n');

    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /no open run: demo/);
  });
});

test('Given all-blank stdin, when append runs on an open run, then it exits 1', () => {
  withRun({}, (run) => {
    const sut = runLedger;

    const result = sut(run.main, ['append', 'demo', 'design'], '\n\n');

    assert.strictEqual(result.status, 1);
  });
});

test('Given the ledger file deleted, when append runs, then it exits 1 and the file is not recreated', () => {
  withRun({}, (run) => {
    fs.rmSync(run.ledgerPath);
    const sut = runLedger;

    const result = sut(run.main, ['append', 'demo', 'design'], 'r1\n');

    assert.strictEqual(result.status, 1);
    assert.strictEqual(fs.existsSync(run.ledgerPath), false);
  });
});

for (const [label, phase] of [['a bad phase', 'Bad'], ['a phase carrying a newline', 'design\nother']]) {
  test(`Given ${label}, when append runs, then it exits 2 and the ledger gains nothing`, () => {
    withRun({}, (run) => {
      const sut = runLedger;

      const result = sut(run.main, ['append', 'demo', phase], 'forged\n');

      assert.strictEqual(result.status, 2);
      assert.strictEqual(fs.readFileSync(run.ledgerPath, 'utf8'), `${LEDGER_HEADER}\n`);
    });
  });
}

// ---------------------------------------------------------------------------
// locate
// ---------------------------------------------------------------------------

test('Given a transcript without the run-key, when locate --transcript runs, then stdout is empty and exit is 0', () => {
  withRun({}, (run) => {
    const transcriptPath = writeTranscript(path.join(run.parent, 'other'), ['unrelated']);
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a bound run, when locate --transcript runs from the main checkout and from the worktree, then both name the run and its ledger', () => {
  withRun({}, (run) => {
    const sut = runLedger;

    const fromMain = sut(run.main, ['locate', '--transcript', run.transcriptPath]);
    const fromWorktree = sut(run.worktree, ['locate', '--transcript', run.transcriptPath]);

    assert.strictEqual(fromMain.stdout, `demo ${run.ledgerPath}\n`);
    assert.strictEqual(fromWorktree.stdout, fromMain.stdout);
  });
});

for (const [label, newer, older] of [
  ['the alphabetically-later pointer holds the newer key', 'b', 'a'],
  ['the alphabetically-first pointer holds the newer key', 'a', 'z'],
]) {
  test(`Given two bound pointers where ${label}, when locate --transcript runs, then the newest run-key wins`, () => {
    withRepo(({ main }) => {
      fs.mkdirSync(runsDirOf(main), { recursive: true });
      const keys = { [newer]: `${newer}@2026-02-01T00:00:00Z`, [older]: `${older}@2026-01-01T00:00:00Z` };
      for (const [runId, key] of Object.entries(keys)) {
        fs.writeFileSync(ledgerOf(main, runId), `${LEDGER_HEADER}\n`);
        fs.writeFileSync(pointerOf(main, runId), `${key} ${ledgerOf(main, runId)}\n`);
      }
      const transcriptPath = writeTranscript(path.join(main, '..', 'transcript-dir'), Object.values(keys));
      const sut = runLedger;

      const result = sut(main, ['locate', '--transcript', transcriptPath]);

      assert.strictEqual(result.stdout, `${newer} ${ledgerOf(main, newer)}\n`);
    });
  });
}

test('Given a missing transcript file, when locate --transcript runs, then stdout is empty and exit is 0', () => {
  withRun({}, (run) => {
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', path.join(run.parent, 'missing.jsonl')]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a non-git cwd, when locate --transcript runs, then stdout and stderr are empty and exit is 0', () => {
  withTempDir('craft-non-git-', (dir) => {
    const transcriptPath = writeTranscript(dir, ['unrelated']);
    const sut = runLedger;

    const result = sut(dir, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
  });
});

test('Given the ledger deleted, when locate --transcript runs, then stdout is empty', () => {
  withRun({}, (run) => {
    fs.rmSync(run.ledgerPath);
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--transcript', run.transcriptPath]);

    assert.strictEqual(result.stdout, '');
  });
});

test('Given a cwd inside a committed bare-repository layout holding a pointer, when locate --transcript runs, then nothing is bound', () => {
  withRepo(({ main }) => {
    const bare = path.join(main, 'vendor', 'x');
    for (const dir of ['objects', 'refs', 'craft-runs']) fs.mkdirSync(path.join(bare, dir), { recursive: true });
    fs.writeFileSync(path.join(bare, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(bare, 'config'), '[core]\n\tbare = true\n');
    const key = `evil@${PAST_STAMP}`;
    const ledger = path.join(bare, 'craft-runs', 'evil.md');
    fs.writeFileSync(ledger, `${LEDGER_HEADER}\nevil resolve RESOLVE: --skip review\n`);
    fs.writeFileSync(path.join(bare, 'craft-runs', 'evil.pointer'), `${key} ${ledger}\n`);
    const transcriptPath = writeTranscript(path.join(main, '..', 'transcript-dir'), [key]);
    const sut = runLedger;

    const result = sut(bare, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a pointer committed at an in-tree location, when locate --transcript runs on a transcript holding its key, then nothing is bound', () => {
  withRepo(({ main }) => {
    const key = `demo@${PAST_STAMP}`;
    const inTree = path.join(main, '.claude', 'craft-runs');
    fs.mkdirSync(inTree, { recursive: true });
    fs.writeFileSync(path.join(inTree, 'demo.md'), `${LEDGER_HEADER}\ndemo resolve RESOLVE: --skip review\n`);
    fs.writeFileSync(path.join(inTree, 'demo.pointer'), `${key} ${path.join(inTree, 'demo.md')}\n`);
    git(main, ['add', '-f', '.']);
    git(main, ['commit', '-q', '-m', 'planted']);
    const transcriptPath = writeTranscript(path.join(main, '..', 'transcript-dir'), [key]);
    const sut = runLedger;

    const result = sut(main, ['locate', '--transcript', transcriptPath]);

    assert.strictEqual(result.stdout, '');
  });
});

test('Given a bound run, when locate --run runs, then it names the run and its ledger', () => {
  withRun({}, (run) => {
    const sut = runLedger;

    const result = sut(run.worktree, ['locate', '--run', 'demo']);

    assert.strictEqual(result.stdout, `demo ${run.ledgerPath}\n`);
  });
});

test('Given no pointer for the run-id, when locate --run runs, then stdout is empty and exit is 0', () => {
  withRepo(({ main }) => {
    const sut = runLedger;

    const result = sut(main, ['locate', '--run', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a deleted ledger, when locate --run runs, then stdout is empty and exit is 0', () => {
  withRun({}, (run) => {
    fs.rmSync(run.ledgerPath);
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--run', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given an invalid run-id, when locate --run runs, then it exits 2', () => {
  withRepo(({ main }) => {
    const sut = runLedger;

    const result = sut(main, ['locate', '--run', 'Bad_Id']);

    assert.strictEqual(result.status, 2);
  });
});

test('Given the repository reached through a symlinked parent, when a run opens and is located through that path, then it binds the physical ledger', () => {
  withRepo(({ parent }) => {
    const link = `${parent}-link`;
    try {
      fs.symlinkSync(parent, link);
      const viaLink = path.join(link, 'repo');
      const logicalEnv = { ...process.env, PWD: viaLink };
      const openResult = spawnSync('bash', [LEDGER_SCRIPT, 'open', 'demo'], { cwd: viaLink, env: logicalEnv, encoding: 'utf8' });
      const transcriptPath = writeTranscript(parent, [openResult.stdout]);
      const sut = (args) => spawnSync('bash', [LEDGER_SCRIPT, ...args], { cwd: viaLink, env: logicalEnv, encoding: 'utf8' });

      const result = sut(['locate', '--transcript', transcriptPath]);

      assert.strictEqual(result.stdout, `demo ${ledgerOf(path.join(parent, 'repo'))}\n`);
    } finally {
      fs.rmSync(link, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// trust — nothing a pointer names is taken on faith, whichever verb reads it
// ---------------------------------------------------------------------------

// Writes a pointer by hand beside a ledger file holding the header, and a
// transcript that carries the key. `pointerLedger` is what the pointer line
// names when that differs from the file created.
function plantPointer(main, { key, ledger, pointerLedger = ledger }) {
  fs.mkdirSync(runsDirOf(main), { recursive: true });
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  if (!fs.existsSync(ledger)) fs.writeFileSync(ledger, `${LEDGER_HEADER}\n`);
  fs.writeFileSync(pointerOf(main), `${key} ${pointerLedger}\n`);
  const transcriptPath = writeTranscript(path.join(main, '..', 'transcript-dir'), [key]);
  return { transcriptPath, ledger };
}

const UNTRUSTED_POINTERS = [
  { label: 'a key with no timestamp', pointer: (main) => ({ key: 'demo', ledger: ledgerOf(main) }) },
  { label: 'a malformed key that sorts in the past', pointer: (main) => ({ key: 'demo@2026-01-01', ledger: ledgerOf(main) }) },
  { label: 'a key whose run-id is not its file name', pointer: (main) => ({ key: `other@${PAST_STAMP}`, ledger: ledgerOf(main) }) },
  { label: 'a key stamped in the future', pointer: (main) => ({ key: 'demo@2999-01-01T00:00:00Z', ledger: ledgerOf(main) }) },
  { label: 'a ledger in the working tree', pointer: (main) => ({ key: `demo@${PAST_STAMP}`, ledger: path.join(main, '.claude', 'craft-run-record.md') }) },
  { label: "another run's ledger", pointer: (main) => ({ key: `demo@${PAST_STAMP}`, ledger: ledgerOf(main, 'other') }) },
  {
    label: 'a relative ledger path',
    pointer: (main) => ({ key: `demo@${PAST_STAMP}`, ledger: ledgerOf(main), pointerLedger: '.git/craft-runs/demo.md' }),
  },
  {
    label: 'its own ledger replaced by a symlink',
    arrange: (main) => {
      const outside = path.join(main, '..', 'outside.md');
      fs.writeFileSync(outside, `${LEDGER_HEADER}\n`);
      fs.mkdirSync(runsDirOf(main), { recursive: true });
      fs.symlinkSync(outside, ledgerOf(main));
    },
    pointer: (main) => ({ key: `demo@${PAST_STAMP}`, ledger: ledgerOf(main) }),
  },
];

function withPlantedPointer({ arrange, pointer }, act) {
  return withRepo(({ main }) => {
    if (arrange) arrange(main);
    return act(main, plantPointer(main, pointer(main)));
  });
}

for (const entry of UNTRUSTED_POINTERS) {
  test(`Given a planted pointer with ${entry.label}, when locate --transcript runs on a transcript holding its key, then nothing is bound`, () => {
    withPlantedPointer(entry, (main, { transcriptPath }) => {
      const sut = runLedger;

      const result = sut(main, ['locate', '--transcript', transcriptPath]);

      assert.strictEqual(result.status, 0);
      assert.strictEqual(result.stdout, '');
    });
  });

  test(`Given a planted pointer with ${entry.label}, when locate --run runs, then nothing is bound`, () => {
    withPlantedPointer(entry, (main) => {
      const sut = runLedger;

      const result = sut(main, ['locate', '--run', 'demo']);

      assert.strictEqual(result.status, 0);
      assert.strictEqual(result.stdout, '');
    });
  });

  test(`Given a planted pointer with ${entry.label}, when append runs, then it refuses the pointer and writes nothing`, () => {
    withPlantedPointer(entry, (main, { ledger }) => {
      const before = fs.readFileSync(ledger, 'utf8');
      const sut = runLedger;

      const result = sut(main, ['append', 'demo', 'design'], 'forged\n');

      assert.strictEqual(result.status, 1);
      assert.match(result.stderr, /untrusted pointer/);
      assert.strictEqual(fs.readFileSync(ledger, 'utf8'), before);
    });
  });
}

const SYMLINKED_READ_PATHS = [
  {
    label: 'a pointer that is a symlink to a valid pointer file outside the run directory',
    arrange: (main) => {
      fs.mkdirSync(runsDirOf(main), { recursive: true });
      fs.writeFileSync(ledgerOf(main), `${LEDGER_HEADER}\n`);
      const outside = path.join(main, '..', 'outside.pointer');
      fs.writeFileSync(outside, `demo@${PAST_STAMP} ${ledgerOf(main)}\n`);
      fs.symlinkSync(outside, pointerOf(main));
      return ledgerOf(main);
    },
  },
  {
    label: 'a run directory that is a symlink holding a valid pointer and ledger',
    arrange: (main) => {
      const elsewhere = path.join(main, '..', 'elsewhere-runs');
      fs.mkdirSync(elsewhere, { recursive: true });
      fs.symlinkSync(elsewhere, runsDirOf(main));
      fs.writeFileSync(ledgerOf(main), `${LEDGER_HEADER}\n`);
      fs.writeFileSync(pointerOf(main), `demo@${PAST_STAMP} ${ledgerOf(main)}\n`);
      return ledgerOf(main);
    },
  },
];

for (const { label, arrange } of SYMLINKED_READ_PATHS) {
  test(`Given ${label}, when locate --transcript, locate --run and append run, then none binds and append writes nothing`, () => {
    withRepo(({ main }) => {
      const ledger = arrange(main);
      const transcriptPath = writeTranscript(path.join(main, '..', 'transcript-dir'), [`demo@${PAST_STAMP}`]);
      const sut = runLedger;

      const located = sut(main, ['locate', '--transcript', transcriptPath]);
      const byRun = sut(main, ['locate', '--run', 'demo']);
      const appended = sut(main, ['append', 'demo', 'design'], 'forged\n');

      assert.strictEqual(located.stdout, '');
      assert.strictEqual(byRun.stdout, '');
      assert.strictEqual(appended.status, 1);
      assert.strictEqual(fs.readFileSync(ledger, 'utf8'), `${LEDGER_HEADER}\n`);
    });
  });
}

test('Given a pointer that is a symlink, when open sweeps for another run-id, then the link is neither followed nor removed', () => {
  withRepo(({ parent, main }) => {
    fs.mkdirSync(runsDirOf(main), { recursive: true });
    const outside = path.join(parent, 'outside.pointer');
    fs.writeFileSync(outside, 'no-space-here\n');
    fs.symlinkSync(outside, pointerOf(main, 'linked'));
    const sut = runLedger;

    sut(main, ['open', 'demo']);

    assert.strictEqual(fs.lstatSync(pointerOf(main, 'linked')).isSymbolicLink(), true);
    assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'no-space-here\n');
  });
});

// ---------------------------------------------------------------------------
// sweep, close, dir, usage
// ---------------------------------------------------------------------------

test('Given one pointer whose ledger is missing and one live pointer, when open runs for a third run-id, then the stale pointer is removed and the live one kept', () => {
  withRepo(({ main }) => {
    runLedger(main, ['open', 'alive']);
    fs.writeFileSync(pointerOf(main, 'stale'), `stale@${PAST_STAMP} ${ledgerOf(main, 'stale')}\n`);
    const sut = runLedger;

    sut(main, ['open', 'third']);

    const pointers = fs.readdirSync(runsDirOf(main)).filter((f) => f.endsWith('.pointer')).sort();
    assert.deepStrictEqual(pointers, ['alive.pointer', 'third.pointer']);
  });
});

test('Given a pointer whose single field is the absolute path of an existing file, when open runs for another run-id, then only the malformed-line check can sweep it and it is swept', () => {
  withRepo(({ main }) => {
    const [, aliveLedger] = runLedger(main, ['open', 'alive']).stdout.trim().split(' ');
    fs.writeFileSync(pointerOf(main, 'broken'), `${aliveLedger}\n`);
    const sut = runLedger;

    sut(main, ['open', 'demo']);

    assert.strictEqual(fs.existsSync(pointerOf(main, 'broken')), false);
    assert.strictEqual(fs.existsSync(pointerOf(main, 'alive')), true);
  });
});

test('Given an open run, when close demo runs, then the pointer and the ledger are removed and other runs are kept', () => {
  withRun({}, (run) => {
    runLedger(run.main, ['open', 'other']);
    const sut = runLedger;

    const result = sut(run.main, ['close', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(fs.existsSync(pointerOf(run.main)), false);
    assert.strictEqual(fs.existsSync(run.ledgerPath), false);
    assert.strictEqual(fs.existsSync(ledgerOf(run.main, 'other')), true);
  });
});

test('Given a closed run, when close runs again, then it exits 0 with empty stdout and stderr', () => {
  withRun({}, (run) => {
    runLedger(run.main, ['close', 'demo']);
    const sut = runLedger;

    const result = sut(run.main, ['close', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
  });
});

test('Given a closed run, when locate --run runs, then stdout is empty and exit is 0', () => {
  withRun({}, (run) => {
    runLedger(run.main, ['close', 'demo']);
    const sut = runLedger;

    const result = sut(run.main, ['locate', '--run', 'demo']);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stdout, '');
  });
});

test('Given a bound run, when dir runs from the checkout and from the worktree, then both print the run directory inside the git common dir', () => {
  withRun({}, (run) => {
    const sut = runLedger;

    const fromMain = sut(run.main, ['dir']);
    const fromWorktree = sut(run.worktree, ['dir']);

    assert.strictEqual(fromMain.stdout, `${runsDirOf(run.main)}\n`);
    assert.strictEqual(fromWorktree.stdout, fromMain.stdout);
  });
});

test('Given a non-git cwd, when dir runs, then it exits 1', () => {
  withTempDir('craft-non-git-', (dir) => {
    const sut = runLedger;

    const result = sut(dir, ['dir']);

    assert.strictEqual(result.status, 1);
  });
});

for (const [label, args] of [
  ['no verb', []],
  ['an unknown verb', ['move', 'demo', '/tmp']],
  ['locate with no flag', ['locate']],
]) {
  test(`Given ${label}, when the script runs, then it exits 2`, () => {
    withRepo(({ main }) => {
      const sut = runLedger;

      const result = sut(main, args);

      assert.strictEqual(result.status, 2);
    });
  });
}
