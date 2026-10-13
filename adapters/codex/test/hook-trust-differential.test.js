import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { delimiter, dirname, join } from 'node:path';
import { GUARD_SCRIPT_SEGMENTS, selectCraftHook } from '../src/hook-trust.js';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_MANIFEST = JSON.parse(readFileSync(join(ADAPTER_DIR, 'hooks.json'), 'utf8'));
const REGISTERED_COMMAND = HOOKS_MANIFEST.hooks.PreToolUse[0].hooks[0].command;

const SHELLS = Object.freeze(['sh', 'bash', 'dash', 'zsh']);
const POOL_SIZE = 8;
const SPAWN_TIMEOUT_MS = 5_000;
const NUL = '\0';
const NODE_ENV_PATTERN = /\bNODE_\w*=/;
const SEED = 2;
const CAP = 2000;
// About 80% of the 44 commands trusted at this seed: a narrowed matcher, or a TMPDIR with non-path characters, collapses the count and must fail loudly.
const ACCEPTED_FLOOR = 35;
const SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
const TAIL = `/${GUARD_SCRIPT_SEGMENTS.join('/')}`;
const FIXTURE_SOURCE_PATH = '/fixture/codex-home/config.toml';
const REFUSAL_PATTERN = /no craft hook found/;
const TREE_PREFIX = 'craft-trust-fuzz-';
const EXECUTABLE_MODE = 0o755;
// The stubs write relative to their cwd, so a command that changed directory leaves no log and fails.
const STUBS = Object.freeze({
  node: `#!/bin/sh\nprintf '%s\\0' "$#" "$@" >> argv.log\nexport -p >> env.log\n`,
  mark: '#!/bin/sh\n: > marker\n',
});
const ROOT_ENV_KINDS = Object.freeze(['none', 'plugin', 'craft']);

const BIN = Object.freeze({ placeholder: 'BIN' });
const ROOT = Object.freeze({ placeholder: 'ROOT' });

const SAFE = Object.freeze(['a', 'b1', '.', '..', '_', '+', '@', '%', ',', ':', '=', '-', '/', ' ', SHIM, 'é', 'x/y']);
const UNSAFE_CLASSES = Object.freeze([
  Object.freeze(['$(mark)', '`mark`', '$((1))', '$[1]']),
  Object.freeze(['${IFS}', '$HOME', '$x', '${x}', '$1', '$@', '${x:-/}', '${CRAFT_ROOT:-/tmp}', '$']),
  Object.freeze(['*', '?', '[a]', '{a,b}', '~', '=mark']),
  Object.freeze([';mark;', '&&mark', '|mark', '&', '<', '>', '(', ')', '#']),
  Object.freeze(['\\', "'", '"', '\n', '\t', ' ', '!']),
  Object.freeze(['${(e)${:-${:-$}(mark)}}', '${y:=a[${z:-$}(mark)]}$[y]']),
]);
const UNSAFE = Object.freeze(UNSAFE_CLASSES.flat());
const PREFIX = Object.freeze([['/'], ['/'], [`${SHIM}/`], [`${SHIM}/`], [SHIM], [''], ['-'], ['--eval='], ['='], [' '], ['~'], ['$HOME'], [ROOT], [ROOT, '/']]);
const LEAD = Object.freeze(['', '', '', ' ', '  ', '\t', 'NODE_OPTIONS=--require=/x ', 'X=1 ']);
const SEP = Object.freeze([' ', ' ', ' ', '  ', '\t', ' ']);
const TRAIL = Object.freeze(['', '', '', '', ' ', '  ', ' --flag', ';mark', ' # c', '\n', '.bak']);
const EDIT_ALPHABET = Object.freeze([...SAFE, ...UNSAFE, 'n', 'o', 'd', 'e', '"', ' ']);

// `=mark` is left out of the composed interpreters: `<bin>/=mark/node` is a literal path that does not exist.
const COMPOSED_INTERPRETERS = Object.freeze(UNSAFE.filter((fragment) => fragment !== '=mark').map((fragment) => [BIN, `/${fragment}/node`]));
const GOOD_INTERPRETERS = Object.freeze([['node'], [BIN, '/node'], [BIN, '//node'], [BIN, '/./node']]);
const BAD_INTERPRETERS = Object.freeze([
  ['X=/node'], ['=', BIN, '/node'], ['./node'], ['-r/node'], ['"node"'], ['\\node'], ['no""de'], ['=node'], ['nod*'], ['X=', BIN, '/node'],
  ...COMPOSED_INTERPRETERS,
]);
const INTERPRETERS = Object.freeze([...GOOD_INTERPRETERS, ...BAD_INTERPRETERS]);

const SAFE_FRAGMENT_ODDS = 0.7;
const GOOD_INTERPRETER_ODDS = 0.7;
const MUTATION_ODDS = 0.5;
const QUOTED_ODDS = 0.5;
const BACKUP_SUFFIX_ODDS = 0.2;
const MAX_BODY_FRAGMENTS = 4;
const MAX_EDITS = 3;
const EDIT_KINDS = Object.freeze(['insert', 'delete', 'replace']);


const REGISTERED_INTERPRETER = 'node';
const REGISTERED_OPERAND = REGISTERED_COMMAND.slice(REGISTERED_INTERPRETER.length);

// Each case is [interpreter segments, operand segments]. Only the operand is ever mutated.
const FIXED_CASES = Object.freeze([
  [['node'], [REGISTERED_OPERAND]],
  [['node'], [` ${SHIM}${TAIL}`]],
  [[BIN, '/node'], [' ', ROOT, TAIL]],
  [[BIN, '/node'], [' "', ROOT, `${TAIL}"`]],
  [['node'], [` =x${TAIL}`]],
  [['=', BIN, '/node'], [' "', ROOT, `${TAIL}"`]],
  [['X=/node'], [' "', ROOT, `${TAIL}"`]],
  [['node'], [` "--eval=process.exitCode=0/${TAIL}"`]],
  [['node'], [` --import=data:text/javascript,0/${TAIL}`]],
  [['node'], [` "\${y:=a[\${z:-$}(mark)]}$[y]${TAIL}"`]],
  [['node'], [` "\${y:=a[\${z:-$}(mark)]}\${a[y]}${TAIL}"`]],
  [['node'], [` "\${y:=a[\${z:-$}(mark)]}\${!y}${TAIL}"`]],
  [['node'], [` "\${(e)\${:-\${:-$}(mark)}}${TAIL}"`]],
]);

async function withStubTree(act) {
  const base = mkdtempSync(join(tmpdir(), TREE_PREFIX));
  try {
    const tree = {
      bin: join(base, 'bin'),
      home: join(base, 'home dir'),
      root: join(base, 'craft-root'),
      other: join(base, 'other'),
      runs: join(base, 'runs'),
    };
    Object.values(tree).forEach((dir) => mkdirSync(dir));
    Object.entries(STUBS).forEach(([name, body]) => writeFileSync(join(tree.bin, name), body, { mode: EXECUTABLE_MODE }));
    return await act(tree);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function renderSegment(segment, tree) {
  if (segment === BIN) return tree.bin;
  if (segment === ROOT) return tree.root;
  return segment;
}

function renderCommand(segments, tree) {
  return segments.map((segment) => renderSegment(segment, tree)).join('');
}

function isTrusted(command) {
  try {
    selectCraftHook([{ command, source: 'user', sourcePath: FIXTURE_SOURCE_PATH }]);
    return true;
  } catch (error) {
    if (REFUSAL_PATTERN.test(error.message)) return false;
    throw error;
  }
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function pickBodyFragment(rng) {
  if (rng() < SAFE_FRAGMENT_ODDS) return pick(rng, SAFE);
  return pick(rng, pick(rng, UNSAFE_CLASSES));
}

function buildBody(rng) {
  const count = Math.floor(rng() * (MAX_BODY_FRAGMENTS + 1));
  return Array.from({ length: count }, () => pickBodyFragment(rng));
}

function buildOperand(rng) {
  const body = buildBody(rng);
  const suffix = rng() < BACKUP_SUFFIX_ODDS ? '.bak' : '';
  const operand = [...pick(rng, PREFIX), ...body, TAIL, suffix];
  return rng() < QUOTED_ODDS ? ['"', ...operand, '"'] : operand;
}

function pickInterpreter(rng) {
  return rng() < GOOD_INTERPRETER_ODDS ? pick(rng, GOOD_INTERPRETERS) : pick(rng, BAD_INTERPRETERS);
}

function buildFromGrammar(rng) {
  return [pick(rng, LEAD), ...pickInterpreter(rng), pick(rng, SEP), ...buildOperand(rng), pick(rng, TRAIL)];
}

function editText(rng, text) {
  const at = Math.floor(rng() * (text.length + 1));
  const kind = pick(rng, EDIT_KINDS);
  const char = pick(rng, EDIT_ALPHABET);
  if (kind === 'insert') return text.slice(0, at) + char + text.slice(at);
  if (kind === 'delete') return text.slice(0, at) + text.slice(at + 1);
  return text.slice(0, at) + char + text.slice(at + 1);
}

function mutateOperand(rng, operand) {
  const literalIndexes = operand.flatMap((segment, index) => (typeof segment === 'string' ? [index] : []));
  const edits = 1 + Math.floor(rng() * MAX_EDITS);
  const mutated = [...operand];
  for (let edit = 0; edit < edits; edit++) {
    const index = pick(rng, literalIndexes);
    mutated[index] = editText(rng, mutated[index]);
  }
  return mutated;
}

function buildFromSeed(rng) {
  const [interpreter, operand] = pick(rng, FIXED_CASES);
  return [...interpreter, ...mutateOperand(rng, operand)];
}

function entryOf(rng, segments) {
  return Object.freeze({ segments: Object.freeze(segments), rootEnvKind: pick(rng, ROOT_ENV_KINDS) });
}

function buildCorpus(seed, cap) {
  const rng = mulberry32(seed);
  const fixed = FIXED_CASES.map(([interpreter, operand]) => entryOf(rng, [...interpreter, ...operand]));
  const generated = Array.from({ length: cap }, () =>
    entryOf(rng, rng() < MUTATION_ODDS ? buildFromSeed(rng) : buildFromGrammar(rng))
  );
  return [...fixed, ...generated];
}

function findOnPath(name) {
  for (const dir of process.env.PATH.split(delimiter)) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function skipReasonFor(shell) {
  return findOnPath(shell) ? false : `${shell} is not on PATH, so its leg did not run`;
}

async function runPool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const drain = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: POOL_SIZE }, drain));
  return results;
}

function spawnRun(shellPath, command, env, runDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(shellPath, ['-c', command], { cwd: runDir, env, timeout: SPAWN_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = { stdout: '', stderr: '' };
    child.stdout.on('data', (chunk) => (chunks.stdout += chunk));
    child.stderr.on('data', (chunk) => (chunks.stderr += chunk));
    child.on('error', (error) => reject(new Error(`spawning ${shellPath} for ${JSON.stringify(command)}: ${error.message}`)));
    child.on('close', (status, signal) => resolve({ status, signal, ...chunks }));
  });
}

function parseInvocations(buffer) {
  const fields = buffer.split(NUL);
  fields.pop();
  const invocations = [];
  for (let at = 0; at < fields.length; ) {
    const count = Number(fields[at]);
    invocations.push(fields.slice(at + 1, at + 1 + count));
    at += 1 + count;
  }
  return invocations;
}

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function isRootedGuardInvocation(invocations) {
  if (invocations.length !== 1 || invocations[0].length !== 1) return false;
  const [argument] = invocations[0];
  return argument.startsWith('/') && argument.endsWith(TAIL);
}

function rootEnvFor(kind, tree) {
  if (kind === 'plugin') return { CLAUDE_PLUGIN_ROOT: tree.root };
  if (kind === 'craft') return { CRAFT_ROOT: tree.root, CLAUDE_PLUGIN_ROOT: tree.other };
  return {};
}

function judge(run) {
  const invocations = parseInvocations(readIfPresent(join(run.runDir, 'argv.log')));
  const marker = existsSync(join(run.runDir, 'marker'));
  const nodeEnv = NODE_ENV_PATTERN.test(readIfPresent(join(run.runDir, 'env.log')));
  const clean = run.status === 0 && run.signal === null && run.stdout === '' && run.stderr === '';
  if (clean && isRootedGuardInvocation(invocations) && !marker && !nodeEnv) return null;
  const { runDir, rootEnv, ...rest } = run;
  return { ...rest, rootEnvKeys: Object.keys(rootEnv), invocations, marker, nodeEnv };
}

async function runCase(shellPath, shell, { index, command, kind }, tree) {
  const runDir = join(tree.runs, String(index));
  mkdirSync(runDir);
  const rootEnv = rootEnvFor(kind, tree);
  const env = { PATH: tree.bin, HOME: tree.home, ...rootEnv };
  const outcome = await spawnRun(shellPath, command, env, runDir);
  return judge({ index, shell, command: JSON.stringify(command), runDir, rootEnv, ...outcome });
}

function runLeg(shellPath) {
  const shell = shellPath.split('/').pop();
  return withStubTree(async (tree) => {
    const cases = buildCorpus(SEED, CAP)
      .map(({ segments, rootEnvKind }, index) => ({ index, command: renderCommand(segments, tree), kind: rootEnvKind }))
      .filter(({ command }) => isTrusted(command));
    const records = await runPool(cases, (item) => runCase(shellPath, shell, item, tree));
    return records.filter((record) => record !== null);
  });
}

describe('selectCraftHook() — every command it trusts runs only the guard, under each shell', () => {
  it('Given the fixed seed, when the corpus is generated twice, then both corpora are identical', () => {
    const first = buildCorpus(SEED, CAP);

    const sut = buildCorpus(SEED, CAP);

    assert.equal(JSON.stringify(sut), JSON.stringify(first));
  });

  it('Given the seeded corpus, when the matcher filters it, then at least ACCEPTED_FLOOR commands are trusted', async () => {
    const corpus = buildCorpus(SEED, CAP);

    const sut = await withStubTree((tree) => corpus.filter(({ segments }) => isTrusted(renderCommand(segments, tree))).length);

    assert.ok(sut >= ACCEPTED_FLOOR, `${sut} trusted, floor ${ACCEPTED_FLOOR}`);
  });

  it('Given every interpreter the corpus can draw, when the matcher trusts it, then a stub exists at that path', async () => {
    const sut = await withStubTree((tree) =>
      INTERPRETERS.map((segments) => renderCommand(segments, tree)).filter(
        (interpreter) => interpreter !== 'node' && isTrusted(`${interpreter} /x${TAIL}`) && !existsSync(interpreter)
      )
    );

    assert.deepEqual(sut, []);
  });

  for (const shell of SHELLS) {
    it(
      `Given every trusted command, when ${shell} -c runs it with a stub node, then each runs the stub once on one rooted guard path and nothing else`,
      { skip: skipReasonFor(shell) },
      async () => {
        const sut = await runLeg(findOnPath(shell));

        assert.deepEqual(sut, []);
      }
    );
  }
});
