import { test, mock } from 'node:test';
import nodeFs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, lstatSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/driver-state-main.js';

const ENV_VAR = 'CRAFT_DRIVER_STATE';
const PR = 'https://example.test/org/repo/pull/70';

function capture() {
  const out = [];
  const err = [];
  return {
    io: { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'driver-state-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function run(sut, argv, deps) {
  const cap = capture();
  const code = sut(argv, cap.io, deps);
  return { code, stdout: cap.stdout(), stderr: cap.stderr() };
}

const envOf = (dir) => ({ [ENV_VAR]: dir });
const noTmp = (dir) => readdirSync(dir).filter((n) => n.includes('.tmp.'));

test('Given an absolute writable dir, when active, then it exits 0 and prints the dir', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['active'], { env: envOf(dir) });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, `${dir}\n`);
  });
});

for (const [label, env] of [['unset', {}], ['empty', { [ENV_VAR]: '' }]]) {
  test(`Given the variable ${label}, when active, then it exits 1 silently`, () => {
    const sut = main;

    const result = run(sut, ['active'], { env });

    assert.equal(result.code, 1);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  });
}

test('Given a relative path, when active, then it exits 2 naming relative', () => {
  const sut = main;
  const result = run(sut, ['active'], { env: { [ENV_VAR]: 'state' } });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /not an absolute path/);
});

test('Given a missing path, when active, then it exits 2 naming missing', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['active'], { env: envOf(join(dir, 'nope')) });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /does not exist/);
  });
});

test('Given a regular file, when active, then it exits 2 naming not a directory', () => {
  const sut = main;
  withDir((dir) => {
    const file = join(dir, 'f');
    writeFileSync(file, 'x');

    const result = run(sut, ['active'], { env: envOf(file) });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /not a directory/);
  });
});

test('Given an unwritable dir, when active, then it exits 2 naming not writable', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, accessSync: () => { throw Object.assign(new Error('nope'), { code: 'EACCES' }); } };

    const result = run(sut, ['active'], { env: envOf(dir), fs });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /not writable/);
  });
});

for (const argv of [[], ['/nonexistent'], ['bogus']]) {
  test(`Given the argv ${JSON.stringify(argv)}, when run, then it exits 2 with usage`, () => {
    const sut = main;

    const result = run(sut, argv, { env: {} });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /^driver-state: usage: driver-state active \| finished/);
  });
}

test('Given reason argv with newline, when blocked, then status holds the normalized line', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['blocked', 'resolve', 'a\n', ' b'], { env: envOf(dir) });

    assert.equal(result.code, 0);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: a b\n');
    assert.deepEqual(noTmp(dir), []);
  });
});

test('Given a bad phase id, when blocked, then it exits 2 and writes nothing', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['blocked', 'Bad Phase', 'why'], { env: envOf(dir) });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given a missing reason, when blocked, then it exits 2', () => {
  const sut = main;
  withDir((dir) => {
    assert.equal(run(sut, ['blocked', 'resolve'], { env: envOf(dir) }).code, 2);
    assert.deepEqual(readdirSync(dir), []);
  });
});

for (const argv of [['blocked', 'resolve', 'x'], ['finished', PR]]) {
  test(`Given the variable unset, when ${argv[0]}, then it exits 2 naming not driven`, () => {
    const sut = main;

    const result = run(sut, argv, { env: {} });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /not driven: CRAFT_DRIVER_STATE is unset/);
  });
}

test('Given the variable set to a regular file, when blocked, then it exits 2 and the file is unchanged', () => {
  const sut = main;
  withDir((dir) => {
    const file = join(dir, 'f');
    writeFileSync(file, 'x');

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(file) });

    assert.equal(result.code, 2);
    assert.equal(readFileSync(file, 'utf8'), 'x');
    assert.deepEqual(readdirSync(dir), ['f']);
  });
});

test('Given an existing status, when blocked, then it exits 4 and bytes are unchanged', () => {
  const sut = main;
  withDir((dir) => {
    writeFileSync(join(dir, 'status'), 'FINISHED https://a.test/x\n');

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir) });

    assert.equal(result.code, 4);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'FINISHED https://a.test/x\n');
    assert.deepEqual(readdirSync(dir), ['status']);
  });
});

test('Given a dangling symlink at status, when blocked, then it exits 4', () => {
  const sut = main;
  withDir((dir) => {
    symlinkSync(join(dir, 'missing-target'), join(dir, 'status'));

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir) });

    assert.equal(result.code, 4);
    assert.deepEqual(readdirSync(dir), ['status']);
  });
});

test('Given a PR url, when finished without election, then only status is written', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['finished', PR], { env: envOf(dir) });

    assert.equal(result.code, 0);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), `FINISHED ${PR}\n`);
    assert.deepEqual(readdirSync(dir), ['status']);
  });
});

function electionFiles(dir) {
  const election = join(dir, 'in-election.md');
  const prompt = join(dir, 'in-prompt.txt');
  writeFileSync(election, '# Election\n\nbody\n');
  writeFileSync(prompt, '/craft:run --policy push=always Next entry');
  return { election, prompt };
}

function stateDir(dir) {
  const state = join(dir, 'state');
  mkdirSync(state);
  return state;
}

test('Given election and prompt, when finished, then files publish in order with the policy stripped', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    const snapshots = [];
    const fs = {
      ...realFs,
      renameSync: (from, to) => {
        realFs.renameSync(from, to);
        snapshots.push(readdirSync(state).sort());
      },
      linkSync: (from, to) => {
        realFs.linkSync(from, to);
        snapshots.push(readdirSync(state).filter((n) => !n.includes('.tmp.')).sort());
      },
    };

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state), fs });

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(snapshots, [['next.md'], ['next.md', 'next.prompt'], ['next.md', 'next.prompt', 'status']]);
    assert.equal(readFileSync(join(state, 'next.md'), 'utf8'), '# Election\n\nbody\n');
    assert.equal(readFileSync(join(state, 'next.prompt'), 'utf8'), '/craft:run Next entry');
    assert.deepEqual(noTmp(state), []);
  });
});

test('Given only --election, when finished, then it exits 2 and writes nothing', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election } = electionFiles(dir);

    const result = run(sut, ['finished', PR, '--election', election], { env: envOf(state) });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(state), []);
  });
});

test('Given an unreadable prompt path, when finished, then it exits 2 and writes nothing', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election } = electionFiles(dir);

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', join(dir, 'gone')], { env: envOf(state) });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(state), []);
  });
});

for (const [label, args] of [['a bad url', ['nope']], ['no url', []], ['a stray arg', [PR, 'extra']]]) {
  test(`Given ${label}, when finished, then it exits 2 and writes nothing`, () => {
    const sut = main;
    withDir((dir) => {
      const result = run(sut, ['finished', ...args], { env: envOf(dir) });

      assert.equal(result.code, 2);
      assert.deepEqual(readdirSync(dir), []);
    });
  });
}

test('Given a trailing arg after the election pair, when finished, then it exits 2 and writes nothing', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt, 'extra'], { env: envOf(state) });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(state), []);
  });
});

test('Given policy leftovers, when finished, then it exits 3 and writes nothing', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    writeFileSync(prompt, '/craft:run --policy\u200B push=always Next entry');

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state) });

    assert.equal(result.code, 3);
    assert.match(result.stderr, /prompt carries policy flags/);
    assert.deepEqual(readdirSync(state), []);
  });
});

test('Given an existing status, when finished with election, then it exits 4 and writes nothing', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    writeFileSync(join(state, 'status'), 'BLOCKED a: b\n');

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state) });

    assert.equal(result.code, 4);
    assert.equal(readFileSync(join(state, 'status'), 'utf8'), 'BLOCKED a: b\n');
    assert.deepEqual(readdirSync(state), ['status']);
  });
});

test('Given a rename failing on next.prompt, when finished, then it exits 5 with no temp and no status', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    const fs = {
      ...realFs,
      renameSync: (from, to) => {
        if (to.endsWith('next.prompt')) {
          throw new Error('disk gone');
        }
        realFs.renameSync(from, to);
      },
    };

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state), fs });

    assert.equal(result.code, 5);
    assert.match(result.stderr, /^driver-state: cannot write next\.prompt: disk gone/);
    assert.deepEqual(readdirSync(state).sort(), ['next.md']);
  });
});

test('Given a symlink at next.md, when finished, then the target is untouched and the link is replaced', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    const outside = join(dir, 'outside.txt');
    writeFileSync(outside, 'keep');
    symlinkSync(outside, join(state, 'next.md'));

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state) });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(readFileSync(outside, 'utf8'), 'keep');
    assert.equal(lstatSync(join(state, 'next.md')).isSymbolicLink(), false);
    assert.deepEqual(noTmp(state), []);
  });
});

test('Given an lstat error other than ENOENT, when blocked, then it exits 5', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, lstatSync: () => { throw Object.assign(new Error('boom'), { code: 'EIO' }); } };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.code, 5);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given a status created after the guard, when blocked, then it exits 4 and the other status is kept', () => {
  const sut = main;
  withDir((dir) => {
    const fs = {
      ...realFs,
      linkSync: (from, to) => {
        writeFileSync(join(dir, 'status'), 'BLOCKED other: concurrent\n');
        realFs.linkSync(from, to);
      },
    };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.code, 4);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED other: concurrent\n');
    assert.deepEqual(noTmp(dir), []);
  });
});

test('Given a temp file this call did not create, when blocked, then it exits 5 and that file is kept', () => {
  const sut = main;
  withDir((dir) => {
    writeFileSync(join(dir, 'status.tmp.4242'), 'driver-owned');

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), pid: 4242 });

    assert.equal(result.code, 5);
    assert.equal(readFileSync(join(dir, 'status.tmp.4242'), 'utf8'), 'driver-owned');
    assert.ok(!readdirSync(dir).includes('status'));
    assert.match(result.stderr, /cannot write status/);
  });
});

test('Given a temp file that cannot be removed, when a write fails, then it exits 5 naming the leftover', () => {
  const sut = main;
  withDir((dir) => {
    const fs = {
      ...realFs,
      linkSync: () => { throw Object.assign(new Error('disk gone'), { code: 'EIO' }); },
      unlinkSync: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); },
    };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.code, 5);
    assert.match(result.stderr, /; cannot remove .*status\.tmp\..*: busy/);
  });
});

test('Given a stat failure other than a missing path, when active, then it exits 2 with the cause', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, statSync: () => { throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }); } };

    const result = run(sut, ['active'], { env: envOf(dir), fs });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /cannot stat .*: EACCES: permission denied/);
    assert.doesNotMatch(result.stderr, /does not exist/);
  });
});

test('Given the reason on stdin, when blocked with -, then status holds the stdin text verbatim', () => {
  const sut = main;
  withDir((dir) => {
    const readStdin = () => 'stderr said $(touch x) and `y`\n';

    const result = run(sut, ['blocked', 'resolve', '-'], { env: envOf(dir), readStdin });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: stderr said $(touch x) and `y`\n');
  });
});

test('Given a write failing after the temp was created, when blocked, then it exits 5 and no temp remains', () => {
  const sut = main;
  withDir((dir) => {
    const fs = {
      ...realFs,
      writeFileSync: (file, content, options) => {
        realFs.writeFileSync(file, content.slice(0, 3), options);
        throw Object.assign(new Error('ENOSPC: no space'), { code: 'ENOSPC' });
      },
    };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.code, 5);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given the temp unlink failing after status is linked, when blocked, then it exits 0 and warns', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, unlinkSync: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.code, 0);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: x\n');
    assert.match(result.stderr, /cannot remove .*status\.tmp\..*: busy/);
  });
});

test('Given an empty stdin, when blocked with -, then it exits 2 and writes nothing', () => {
  const sut = main;
  withDir((dir) => {
    const readStdin = () => '\n';

    const result = run(sut, ['blocked', 'resolve', '-'], { env: envOf(dir), readStdin });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given - among other reason words, when blocked, then the words are taken literally', () => {
  const sut = main;
  withDir((dir) => {
    const readStdin = () => { throw new Error('stdin must not be read'); };

    const result = run(sut, ['blocked', 'resolve', '-', 'x'], { env: envOf(dir), readStdin });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: - x\n');
  });
});

const failWith = (message, code) => () => { throw Object.assign(new Error(message), { code }); };
const PID = 4242;

test('Given a state dir, when blocked, then it exits 0 with nothing on stderr', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), pid: PID });

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
  });
});

test('Given no argument, when finished, then it exits 2 asking for a pr-url', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['finished'], { env: envOf(dir) });

    assert.equal(result.code, 2);
    assert.equal(result.stderr, 'driver-state: finished needs a <pr-url>\n');
  });
});

test('Given no phase id, when blocked, then it exits 2 naming the empty phase id', () => {
  const sut = main;
  withDir((dir) => {
    const result = run(sut, ['blocked'], { env: envOf(dir) });

    assert.equal(result.code, 2);
    assert.equal(result.stderr, 'driver-state: invalid phase id: ""\n');
  });
});

const PAIRING_ERROR = 'driver-state: finished takes --election <md> --prompt <file> together, or neither\n';
const MISPAIRED = Object.freeze([
  ['a misnamed election flag', (e, p) => ['bogus', e, '--prompt', p]],
  ['a misnamed prompt flag', (e, p) => ['--election', e, 'bogus', p]],
  ['a missing prompt path', (e) => ['--election', e, '--prompt']],
]);

for (const [label, options] of MISPAIRED) {
  test(`Given ${label}, when finished, then it exits 2 with the pairing error and writes nothing`, () => {
    const sut = main;
    withDir((dir) => {
      const state = stateDir(dir);
      const { election, prompt } = electionFiles(dir);

      const result = run(sut, ['finished', PR, ...options(election, prompt)], { env: envOf(state) });

      assert.equal(result.code, 2);
      assert.equal(result.stderr, PAIRING_ERROR);
      assert.deepEqual(readdirSync(state), []);
    });
  });
}

test('Given an election holding invalid UTF-8, when finished, then next.md holds the text decoding of it', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    writeFileSync(election, Buffer.from([0xff]));

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state) });

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(readFileSync(join(state, 'next.md')), Buffer.from('�'));
  });
});

test('Given two lookalike policy flags, when finished, then the refusal lists both separated by a space', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    writeFileSync(prompt, 'a --POLICY b --Policy c');

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state) });

    assert.equal(result.code, 3);
    assert.equal(result.stderr, 'driver-state: prompt carries policy flags: --POLICY --Policy\n');
  });
});

test('Given an existing status, when blocked, then stderr says status already exists', () => {
  const sut = main;
  withDir((dir) => {
    writeFileSync(join(dir, 'status'), 'BLOCKED a: b\n');

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir) });

    assert.equal(result.stderr, 'driver-state: status already exists\n');
  });
});

test('Given an lstat error other than ENOENT, when blocked, then stderr carries the cause', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, lstatSync: failWith('boom', 'EIO') };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.stderr, 'driver-state: cannot write status: boom\n');
  });
});

test('Given a status created after the guard, when blocked, then stderr says status already exists', () => {
  const sut = main;
  withDir((dir) => {
    const fs = {
      ...realFs,
      linkSync: (from, to) => {
        writeFileSync(join(dir, 'status'), 'BLOCKED other: concurrent\n');
        realFs.linkSync(from, to);
      },
    };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.stderr, 'driver-state: status already exists\n');
  });
});

test('Given a temp file this call did not create, when blocked, then stderr is the write error alone', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, writeFileSync: failWith('taken', 'EEXIST') };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs, pid: PID });

    assert.equal(result.stderr, 'driver-state: cannot write status: taken\n');
  });
});

test('Given a write failing after the temp was created, when blocked, then stderr is the write error alone', () => {
  const sut = main;
  withDir((dir) => {
    const fs = {
      ...realFs,
      writeFileSync: (file, content, options) => {
        realFs.writeFileSync(file, content, options);
        throw Object.assign(new Error('ENOSPC: no space'), { code: 'ENOSPC' });
      },
    };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs, pid: PID });

    assert.equal(result.stderr, 'driver-state: cannot write status: ENOSPC: no space\n');
  });
});

test('Given a write failing before any temp exists, when blocked, then stderr is the write error alone', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, writeFileSync: failWith('disk', 'EIO') };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs, pid: PID });

    assert.equal(result.stderr, 'driver-state: cannot write status: disk\n');
  });
});

test('Given a link failing, when blocked, then stderr is the move error alone', () => {
  const sut = main;
  withDir((dir) => {
    const fs = { ...realFs, linkSync: failWith('gone', 'EIO') };

    const result = run(sut, ['blocked', 'resolve', 'x'], { env: envOf(dir), fs, pid: PID });

    assert.equal(result.stderr, 'driver-state: cannot write status: gone\n');
  });
});

test('Given unlink failing for every temp, when finished with election, then only the status temp is reported', () => {
  const sut = main;
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    const fs = { ...realFs, unlinkSync: failWith('busy', 'EBUSY') };

    const result = run(sut, ['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state), fs, pid: PID });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, `driver-state: status written; cannot remove ${join(state, `status.tmp.${PID}`)}: busy\n`);
  });
});

function runWithStubbedFileRead(sut, argv, env, stubbedText) {
  const reads = [];
  const stub = mock.method(nodeFs, 'readFileSync', (target, encoding) => {
    reads.push([target, encoding]);
    return stubbedText;
  });
  syncBuiltinESMExports();
  try {
    return { ...run(sut, argv, { env }), reads };
  } finally {
    stub.mock.restore();
    syncBuiltinESMExports();
  }
}

test('Given no injected reader, when blocked with -, then the reason is read from standard input as UTF-8 text', () => {
  const sut = main;
  withDir((dir) => {
    const result = runWithStubbedFileRead(sut, ['blocked', 'resolve', '-'], envOf(dir), 'process stdin reason\n');

    assert.equal(result.code, 0, result.stderr);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: process stdin reason\n');
    assert.deepEqual(result.reads, [[0, 'utf8']]);
  });
});
