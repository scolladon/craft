import { test } from 'node:test';
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

function run(argv, deps) {
  const cap = capture();
  const code = main(argv, cap.io, deps);
  return { code, stdout: cap.stdout(), stderr: cap.stderr() };
}

const envOf = (dir) => ({ [ENV_VAR]: dir });
const noTmp = (dir) => readdirSync(dir).filter((n) => n.includes('.tmp.'));

test('Given an absolute writable dir, when active, then it exits 0 and prints the dir', () => {
  withDir((dir) => {
    const result = run(['active'], { env: envOf(dir) });

    assert.equal(result.code, 0);
    assert.equal(result.stdout, `${dir}\n`);
  });
});

test('Given the variable unset or empty, when active, then it exits 1 silently', () => {
  for (const env of [{}, { [ENV_VAR]: '' }]) {
    const result = run(['active'], { env });

    assert.equal(result.code, 1);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
  }
});

test('Given a relative path, when active, then it exits 2 naming relative', () => {
  const result = run(['active'], { env: { [ENV_VAR]: 'state' } });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /not an absolute path/);
});

test('Given a missing path, when active, then it exits 2 naming missing', () => {
  withDir((dir) => {
    const result = run(['active'], { env: envOf(join(dir, 'nope')) });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /does not exist/);
  });
});

test('Given a regular file, when active, then it exits 2 naming not a directory', () => {
  withDir((dir) => {
    const file = join(dir, 'f');
    writeFileSync(file, 'x');

    const result = run(['active'], { env: envOf(file) });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /not a directory/);
  });
});

test('Given an unwritable dir, when active, then it exits 2 naming not writable', () => {
  withDir((dir) => {
    const fs = { ...realFs, accessSync: () => { throw Object.assign(new Error('nope'), { code: 'EACCES' }); } };

    const result = run(['active'], { env: envOf(dir), fs });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /not writable/);
  });
});

test('Given no verb or an unknown verb, when run, then it exits 2 with usage', () => {
  for (const argv of [[], ['/nonexistent'], ['bogus']]) {
    const result = run(argv, { env: {} });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /^driver-state: usage: driver-state active \| finished/);
  }
});

test('Given reason argv with newline, when blocked, then status holds the normalized line', () => {
  withDir((dir) => {
    const result = run(['blocked', 'resolve', 'a\n', ' b'], { env: envOf(dir) });

    assert.equal(result.code, 0);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: a b\n');
    assert.deepEqual(noTmp(dir), []);
  });
});

test('Given a bad phase id, when blocked, then it exits 2 and writes nothing', () => {
  withDir((dir) => {
    const result = run(['blocked', 'Bad Phase', 'why'], { env: envOf(dir) });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given a missing reason, when blocked, then it exits 2', () => {
  withDir((dir) => {
    assert.equal(run(['blocked', 'resolve'], { env: envOf(dir) }).code, 2);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given the variable unset, when blocked or finished, then it exits 2 and writes nothing', () => {
  withDir((dir) => {
    assert.equal(run(['blocked', 'resolve', 'x'], { env: {} }).code, 2);
    assert.equal(run(['finished', PR], { env: { [ENV_VAR]: '' } }).code, 2);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given an existing status, when blocked, then it exits 4 and bytes are unchanged', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'status'), 'FINISHED https://a.test/x\n');

    const result = run(['blocked', 'resolve', 'x'], { env: envOf(dir) });

    assert.equal(result.code, 4);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'FINISHED https://a.test/x\n');
    assert.deepEqual(readdirSync(dir), ['status']);
  });
});

test('Given a dangling symlink at status, when blocked, then it exits 4', () => {
  withDir((dir) => {
    symlinkSync(join(dir, 'missing-target'), join(dir, 'status'));

    const result = run(['blocked', 'resolve', 'x'], { env: envOf(dir) });

    assert.equal(result.code, 4);
    assert.deepEqual(readdirSync(dir), ['status']);
  });
});

test('Given a PR url, when finished without election, then only status is written', () => {
  withDir((dir) => {
    const result = run(['finished', PR], { env: envOf(dir) });

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
    };

    const result = run(['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state), fs });

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(snapshots, [['next.md'], ['next.md', 'next.prompt'], ['next.md', 'next.prompt', 'status']]);
    assert.equal(readFileSync(join(state, 'next.md'), 'utf8'), '# Election\n\nbody\n');
    assert.equal(readFileSync(join(state, 'next.prompt'), 'utf8'), '/craft:run Next entry');
    assert.deepEqual(noTmp(state), []);
  });
});

test('Given only --election, when finished, then it exits 2 and writes nothing', () => {
  withDir((dir) => {
    const state = stateDir(dir);
    const { election } = electionFiles(dir);

    const result = run(['finished', PR, '--election', election], { env: envOf(state) });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(state), []);
  });
});

test('Given an unreadable prompt path, when finished, then it exits 2 and writes nothing', () => {
  withDir((dir) => {
    const state = stateDir(dir);
    const { election } = electionFiles(dir);

    const result = run(['finished', PR, '--election', election, '--prompt', join(dir, 'gone')], { env: envOf(state) });

    assert.equal(result.code, 2);
    assert.deepEqual(readdirSync(state), []);
  });
});

test('Given a bad url or extra args, when finished, then it exits 2', () => {
  withDir((dir) => {
    assert.equal(run(['finished', 'nope'], { env: envOf(dir) }).code, 2);
    assert.equal(run(['finished'], { env: envOf(dir) }).code, 2);
    assert.equal(run(['finished', PR, 'extra'], { env: envOf(dir) }).code, 2);
    assert.deepEqual(readdirSync(dir), []);
  });
});

test('Given policy leftovers, when finished, then it exits 3 and writes nothing', () => {
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    const strip = () => ({ prompt: 'x', leftovers: ['--policy'] });

    const result = run(['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state), strip });

    assert.equal(result.code, 3);
    assert.match(result.stderr, /--policy/);
    assert.deepEqual(readdirSync(state), []);
  });
});

test('Given an existing status, when finished with election, then it exits 4 and writes nothing', () => {
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    writeFileSync(join(state, 'status'), 'BLOCKED a: b\n');

    const result = run(['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state) });

    assert.equal(result.code, 4);
    assert.deepEqual(readdirSync(state), ['status']);
  });
});

test('Given a rename failing on next.prompt, when finished, then it exits 5 with no temp and no status', () => {
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

    const result = run(['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state), fs });

    assert.equal(result.code, 5);
    assert.match(result.stderr, /^driver-state: cannot write next\.prompt: disk gone/);
    assert.deepEqual(readdirSync(state).sort(), ['next.md']);
  });
});

test('Given a symlink at next.md, when finished, then the target is untouched and the link is replaced', () => {
  withDir((dir) => {
    const state = stateDir(dir);
    const { election, prompt } = electionFiles(dir);
    const outside = join(dir, 'outside.txt');
    writeFileSync(outside, 'keep');
    symlinkSync(outside, join(state, 'next.md'));

    const result = run(['finished', PR, '--election', election, '--prompt', prompt], { env: envOf(state) });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(readFileSync(outside, 'utf8'), 'keep');
    assert.equal(lstatSync(join(state, 'next.md')).isSymbolicLink(), false);
    assert.deepEqual(noTmp(state), []);
  });
});

test('Given an lstat error other than ENOENT, when blocked, then it exits 5', () => {
  withDir((dir) => {
    const fs = { ...realFs, lstatSync: () => { throw Object.assign(new Error('boom'), { code: 'EIO' }); } };

    const result = run(['blocked', 'resolve', 'x'], { env: envOf(dir), fs });

    assert.equal(result.code, 5);
    assert.deepEqual(readdirSync(dir), []);
  });
});
