import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { RESIDUAL_MARKER, mulberry32, pick } from './git-differential-harness.js';

const EXECUTABLE_MODE = 0o755;
const ANCHOR_INVOCATION = 'git push';
const PREFIX_ODDS = 0.5;
const FILLER_ODDS = 0.5;

const PLAIN_GATE_TAGS = Object.freeze({
  plain: 'plain',
  prefix: 'prefix',
  unplainCharacter: 'unplain-character',
  evaluatorWord: 'evaluator-word',
  argvWrapper: 'argv-wrapper',
  residual: 'residual',
  quotedExpansion: 'quoted-expansion',
  unsafeConfig: 'unsafe-config',
  anyWordAnchor: 'any-word-anchor',
  controlFlowUnreached: 'control-flow-unreached',
  shellDependent: 'shell-dependent',
});
const TAG = PLAIN_GATE_TAGS;
// Each tag names one intended false block the copilot docs state; residual is accepted either way.
const PLAIN_GATE_FALSE_BLOCK_TAGS = Object.freeze([
  TAG.quotedExpansion, TAG.unplainCharacter, TAG.evaluatorWord, TAG.unsafeConfig, TAG.anyWordAnchor, TAG.controlFlowUnreached,
]);
// bash 3.2 rejects an odd quote or backtick inside a heredoc held by $(...); bash 5 accepts it.
const SHELL_DEPENDENT_TAGS = Object.freeze([TAG.shellDependent]);

const GIT_INVOCATIONS = Object.freeze([
  'git push', 'git push origin main', 'git reset --hard', 'git reset --soft', 'git clean -fd', 'git clean -n',
  'git branch -D x', 'git branch -d x', 'git diff', 'git diff --no-ext-diff', 'git show', 'git status', 'git log -1',
]);
const FILLERS = Object.freeze(['ls', 'echo ok', 'true', 'git status', 'git log -1']);
const JOINERS_BEFORE = Object.freeze(['; ', ' && ', ' | ', '\n']);
const JOINERS_AFTER = Object.freeze(['; ', ' && ', '\n']);

// A redirect or assignment goes on the core's last pipeline element; a structure wraps the whole core.
const WORD_PREFIXES = Object.freeze(['> o ', '>>o ', '2>/dev/null ', '2>&1 ', '>|o ', 'A=1 ']);
const UNTIL_PREFIX = core => `until ${core}; do :; done`;
const STRUCTURE_PREFIXES = Object.freeze([
  core => `if ${core}; then :; fi`,
  core => `while ${core}; do break; done`,
  core => `if true; then ${core}; fi`,
  core => `true && ${core}`,
  core => `false || ${core}`,
  core => `echo x | ${core}`,
  core => `${core} | cat`,
]);

const PREFIX = Object.freeze({ none: 'none', simple: 'simple', loopSafe: 'loop-safe' });

const shape = (tags, render, { head = '', prefix = PREFIX.none, pipeable = true } = {}) =>
  Object.freeze({ tags: Object.freeze([...tags]), head, render, prefix, pipeable });

const idiom = body => `git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`;

const CORE_SHAPES = Object.freeze([
  shape([TAG.plain], g => g, { prefix: PREFIX.loopSafe }),
  shape([TAG.unplainCharacter], g => `! ${g}`, { pipeable: false }),
  shape([TAG.unplainCharacter], g => `{ ${g}; }`),
  shape([TAG.unplainCharacter], g => `( ${g} )`),
  shape([TAG.unplainCharacter], g => `${g} # c`),
  shape([TAG.unplainCharacter], g => `${g} < /dev/null`),
  shape([TAG.unplainCharacter], g => `case x in x) ${g};; esac`),
  ...['env', 'command', 'nohup', 'nice', 'exec', 'time', 'sudo', 'timeout 5'].map(wrapper =>
    shape([TAG.evaluatorWord], g => `${wrapper} ${g}`, { prefix: PREFIX.simple })),
  shape([TAG.evaluatorWord], g => `trap '${g}' EXIT`, { prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `mapfile -tc1 -C '${g}'`, { head: 'seq 2 | ', prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `readarray -tc1 -C '${g}'`, { head: 'seq 2 | ', prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `compgen -C '${g}' x`, { prefix: PREFIX.simple }),
  shape([TAG.evaluatorWord], g => `coproc ${g}; wait`, { pipeable: false }),
  shape([TAG.evaluatorWord], () => 'mapfile -t a', { head: 'git log | ', prefix: PREFIX.simple }),
  ...['stdbuf -o0', 'caffeinate', 'setsid', 'chrt -o 0', 'taskset 1', 'unbuffer', 'doas', 'strace -f', 'flock o', 'xcrun',
    'arch -arm64', 'ssh host'].map(wrapper => shape([TAG.argvWrapper], g => `${wrapper} ${g}`, { prefix: PREFIX.simple })),
  ...['watch -n1 -t', 'tmux new -d', 'ssh host', 'parallel :::'].map(runner =>
    shape([TAG.residual], g => `${runner} '${g} ${RESIDUAL_MARKER}'`, { prefix: PREFIX.simple })),
  shape([TAG.quotedExpansion], () => idiom('msg')),
  shape([TAG.quotedExpansion], g => idiom(`x)"; ${g}; echo "`)),
  shape([TAG.quotedExpansion, TAG.shellDependent], () => idiom('a`b')),
  shape([TAG.quotedExpansion, TAG.shellDependent], () => idiom("don't")),
  shape([TAG.quotedExpansion], () => "git commit -m 'cost $5'"),
  shape([TAG.quotedExpansion], () => 'git commit -m "stop!"'),
  shape([TAG.quotedExpansion], () => 'git commit -m "a\\\\b"'),
  shape([TAG.quotedExpansion], () => "git log --format='%H `x`'"),
  shape([TAG.unsafeConfig], () => 'git -c core.pager=cat log -1'),
  shape([TAG.unsafeConfig], () => 'GIT_PAGER=cat git log -1'),
  shape([TAG.unsafeConfig], () => 'git -c alias.p=push p'),
  shape([TAG.anyWordAnchor], g => `echo ${g}`),
  shape([TAG.controlFlowUnreached], g => `false && ${g}`),
]);

const entry = (text, tags) => Object.freeze({ text, tags: Object.freeze([...new Set(tags)]) });

const prefixesOf = core => {
  if (core.prefix === PREFIX.none) return [];
  const words = WORD_PREFIXES.map(word => text => `${core.head}${word}${text}`);
  const structures = [...STRUCTURE_PREFIXES, ...(core.prefix === PREFIX.loopSafe ? [UNTIL_PREFIX] : [])];
  return [...words, ...structures.map(wrap => text => wrap(`${core.head}${text}`))];
};

const bare = (core, invocation) => `${core.head}${core.render(invocation)}`;

const prefixed = (core, invocation, wrap) => entry(wrap(core.render(invocation)), [...core.tags, TAG.prefix]);

const PLAIN_CORE = CORE_SHAPES[0];
// One row per core shape, then every prefix over the plain core: each class is reached at any cap past the anchors.
const ANCHORS = Object.freeze([
  ...CORE_SHAPES.map(core => entry(bare(core, ANCHOR_INVOCATION), core.tags)),
  ...prefixesOf(PLAIN_CORE).map(wrap => prefixed(PLAIN_CORE, ANCHOR_INVOCATION, wrap)),
]);

function composedCore(rng, core, invocation) {
  const prefixes = prefixesOf(core);
  if (prefixes.length === 0 || rng() >= PREFIX_ODDS) return entry(bare(core, invocation), core.tags);
  return prefixed(core, invocation, pick(rng, prefixes));
}

function withFillers(rng, core, judged) {
  const before = rng() < FILLER_ODDS ? `${pick(rng, FILLERS)}${pick(rng, core.pipeable ? JOINERS_BEFORE : JOINERS_AFTER)}` : '';
  const after = rng() < FILLER_ODDS ? `${pick(rng, JOINERS_AFTER)}${pick(rng, FILLERS)}` : '';
  return entry(`${before}${judged.text}${after}`, judged.tags);
}

function composed(rng) {
  const core = pick(rng, CORE_SHAPES);
  return withFillers(rng, core, composedCore(rng, core, pick(rng, GIT_INVOCATIONS)));
}

/**
 * The anchor rows first (every core shape once, then every prefix over the plain core), then random
 * compositions of one judged core between optional plain fillers.
 * @param {number} seed
 * @param {number} cap
 * @returns {ReadonlyArray<{ text: string, tags: ReadonlyArray<string> }>}
 */
function generatePlainGateCommands(seed, cap) {
  const rng = mulberry32(seed);
  const random = Array.from({ length: Math.max(cap - ANCHORS.length, 0) }, () => composed(rng));
  return Object.freeze([...ANCHORS, ...random].slice(0, cap));
}

// ---------------------------------------------------------------- stubs

const argvWrapperStub = shifted => ['#!/bin/sh', `shift ${shifted}`, 'exec "$@"', ''].join('\n');
const STRING_RUNNER_STUB = ['#!/bin/sh', 'for last; do :; done', 'exec /bin/sh -c "$last"', ''].join('\n');
const SSH_STUB = ['#!/bin/sh', 'shift 1', 'exec /bin/sh -c "$*"', ''].join('\n');
// The count is the option words the generator always spells for that name.
const ARGV_WRAPPER_SHIFTS = Object.freeze({
  stdbuf: 1, caffeinate: 0, setsid: 0, chrt: 2, taskset: 1, unbuffer: 0, doas: 0, strace: 1, flock: 1, xcrun: 0,
  arch: 1, sudo: 0, timeout: 1, nice: 0, nohup: 0,
});

const STUBS = Object.freeze({
  ...Object.fromEntries(Object.entries(ARGV_WRAPPER_SHIFTS).map(([name, shifted]) => [name, argvWrapperStub(shifted)])),
  ssh: SSH_STUB,
  watch: STRING_RUNNER_STUB,
  tmux: STRING_RUNNER_STUB,
  parallel: STRING_RUNNER_STUB,
});

function installStubs(binDir) {
  for (const [name, script] of Object.entries(STUBS)) writeFileSync(join(binDir, name), script, { mode: EXECUTABLE_MODE });
}

export {
  ANCHORS,
  CORE_SHAPES,
  PLAIN_GATE_FALSE_BLOCK_TAGS,
  PLAIN_GATE_TAGS,
  SHELL_DEPENDENT_TAGS,
  STUBS,
  generatePlainGateCommands,
  installStubs,
};
