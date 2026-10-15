import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { normaliseGitArgv, gitInvocations } from '../../src/guards/shell-git-invocations.js';
import { gitDestructivePredicate } from '../../src/guards/git-destructive-predicate.js';
import { gitExtDiffPredicate } from '../../src/guards/git-ext-diff-predicate.js';

// Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults, which keep CI under five seconds.
const parseSeeds = text => text.split(',').map(Number);
const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
const LEG_B_SHARE = 0.375;
const LEG_B_CAP = Math.round(CAP * LEG_B_SHARE);
const INVOKED_FLOOR = CAP / 2;
const RESIDUAL_MARKER = 'residual-marker';
const POOL_SIZE = 8;
const SPAWN_TIMEOUT_MS = 5_000;
const FUZZ_TIMEOUT_MS = 60_000;
const MAX_DEPTH = 3;
const LEAF_ODDS = 0.35;
const SPECIAL_ODDS = 0.12;
const UINT32_RANGE = 2 ** 32;
const NUL = '\0';
const EXECUTABLE_MODE = 0o755;
const TREE_PREFIX = 'craft-git-fuzz-';
const SANITY_BASH = '/bin/bash';
const MIN_SECOND_BASH_MAJOR = 5;
const STRICT_GIT_VERSION = /^git version 2\.54\./;
const SENTINEL_SUBCOMMAND = 'rev-parse';
const MAX_LEG_B_OPTIONS = 4;
const OVER_NESTING = 9;
const SYNTAX_ERROR = /syntax error|unexpected EOF/;
// bash 3.2 cannot match the closing paren of a $(...) that holds a comment, a heredoc or an odd quote inside a heredoc body:
// it runs nothing, so the predicates' conservative block is not a false block.
const SHELL_REJECTED = /bad substitution/;

const TAGS = Object.freeze({
  residual: 'residual',
  unterminated: 'unterminated',
  overNested: 'over-nested',
  anyWordAnchor: 'any-word-anchor',
  dynamicHead: 'dynamic-head',
  dynamicArg: 'dynamic-arg',
  dynamicSubcommand: 'dynamic-subcommand',
  patternWord: 'pattern-word',
  dashedBuiltin: 'dashed-builtin',
  configChannel: 'config-channel',
  dynamicBeforeVerb: 'dynamic-before-verb',
  opaqueString: 'opaque-string',
  arithmeticHeredoc: 'arithmetic-heredoc',
});
const FALSE_BLOCK_TAGS = Object.freeze([
  TAGS.unterminated, TAGS.overNested, TAGS.anyWordAnchor, TAGS.dynamicHead, TAGS.dynamicArg, TAGS.dynamicSubcommand,
  TAGS.patternWord, TAGS.dashedBuiltin, TAGS.configChannel, TAGS.dynamicBeforeVerb,
]);
const PARSE_FAILURE_TAGS = Object.freeze([TAGS.unterminated, TAGS.overNested, TAGS.opaqueString, TAGS.arithmeticHeredoc]);

// The stub is the only git a judged command can reach: it records argv and does nothing else.
const STUB_GIT = ['#!/bin/sh', `printf '%s\\0' "$#" "$@" >> "$FUZZ_LOG"`, ''].join('\n');

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

const pick = (rng, items) => items[Math.floor(rng() * items.length)];

const singleQuote = text => `'${text.replaceAll("'", `'\\''`)}'`;

// ---------------------------------------------------------------- fragments

const fragment = (text, { tags = [], status = 0, simple = false, lineEnd = false, keywordLed = false } = {}) =>
  Object.freeze({ text, tags: Object.freeze([...tags]), status, simple, lineEnd, keywordLed });

const mergedTags = (...fragments) => [...new Set(fragments.flatMap(item => item.tags))];

// A heredoc leaves its body and terminator on the following lines, so whatever closes the construct must start a new line.
const LEADING_SEMICOLONS = /^;+ */;
const closed = (inner, closer) =>
  inner.lineEnd ? `${inner.text}\n${closer.replace(LEADING_SEMICOLONS, '')}` : `${inner.text} ${closer}`;

const GIT_SPELLINGS = Object.freeze(['git', 'git', 'git', '"git"', "'git'", 'g\\it', 'g""it', '$\'git\'']);
const WORD_STYLES = Object.freeze([
  word => word,
  word => word,
  word => word,
  word => `"${word}"`,
  word => `'${word}'`,
  word => `\\${word}`,
  word => (word.length > 1 ? `${word[0]}""${word.slice(1)}` : word),
  word => `$'${word}'`,
]);
const spell = (rng, word) => pick(rng, WORD_STYLES)(word);

const GLOBAL_OPTIONS = Object.freeze([
  '-C .', '-C x', '-c k.v=1', '-c core.pager=cat', '-c alias.p=push', '--git-dir=.git', '--git-dir .git', '--work-tree .',
  '--work-tree=.', '--namespace=x', '--config-env=k.v=HOME', '--config-env k.v=HOME', '--attr-source=HEAD', '--attr-source HEAD',
  '--no-pager', '-p', '-P', '--paginate', '--no-optional-locks', '--literal-pathspecs', '--glob-pathspecs',
  '--noglob-pathspecs', '--icase-pathspecs', '--no-replace-objects', '--no-lazy-fetch', '--no-advice', '--bare',
  '--exec-path=x', '--exec-path', '--list-cmds=main', '--frobnicate',
]);
const VERBS = Object.freeze([
  ['push', ''], ['push', 'origin main'], ['reset', '--hard'], ['reset', '--soft'], ['reset', ''], ['clean', '-fd'], ['clean', '-n'],
  ['clean', '-fdn'], ['branch', '-D x'], ['branch', '-d x'], ['branch', '-d -f x'], ['branch', '--delete --force x'], ['diff', ''],
  ['diff', '--no-ext-diff'], ['show', ''], ['show', '--no-ext-diff HEAD'], ['status', ''], ['log', '-1'],
  ['reset', '--har'], ['clean', '--dry'], ['clean', '-fd --no-d'], ['branch', '--del --forc x'],
  ['diff', '--no-ext-diff --ext-diff'], ['show', '--ext-diff --no-ext-diff'],
]);
const EXTRA_ARGS = Object.freeze(['', '', '', 'x', '\\"', "\\'", "$'ab'", '"a b"', "'a b'", '--', '-q']);
const COMMENT_SUFFIXES = Object.freeze(['', '', '', '', ' # git push', ' # git reset --hard']);
const ASSIGNMENTS = Object.freeze(['', '', '', '', 'NAME=v ', 'x=$((1+2)) ', 'A=1 B=2 ']);
const WRAPPERS = Object.freeze(['', '', '', 'env ', 'command ', 'nohup ']);

const optionWords = rng => Array.from({ length: Math.floor(rng() * 3) }, () => pick(rng, GLOBAL_OPTIONS));

function gitWords(rng) {
  const [verb, args] = pick(rng, VERBS);
  const rest = [...args.split(' ').filter(Boolean).map(word => spell(rng, word)), pick(rng, EXTRA_ARGS)].filter(Boolean);
  return [pick(rng, GIT_SPELLINGS), ...optionWords(rng), spell(rng, verb), ...rest].join(' ');
}

function wrapInvocation(rng, invocation) {
  const choice = rng();
  if (choice < 0.1) return fragment(`echo x | xargs ${invocation}`);
  if (choice < 0.2) return fragment(`( exec ${invocation} )`);
  return fragment(`${pick(rng, ASSIGNMENTS)}${pick(rng, WRAPPERS)}${invocation}`, { simple: true });
}

function gitLeaf(rng) {
  const wrapped = wrapInvocation(rng, gitWords(rng));
  const comment = pick(rng, COMMENT_SUFFIXES);
  return fragment(`${wrapped.text}${comment}`, { simple: wrapped.simple && comment === '', lineEnd: comment !== '' });
}

const SPECIALS = Object.freeze([
  fragment('H=--hard; git reset $H', { tags: [TAGS.dynamicArg] }),
  fragment('H=--soft; git reset $H', { tags: [TAGS.dynamicArg] }),
  fragment('D=-D; git branch $D x', { tags: [TAGS.dynamicArg] }),
  fragment('D=-d; git branch $D x', { tags: [TAGS.dynamicArg] }),
  fragment('P=push; git $P HEAD', { tags: [TAGS.dynamicSubcommand] }),
  fragment('D=diff; git $D HEAD', { tags: [TAGS.dynamicSubcommand] }),
  fragment('S=status; git $S HEAD', { tags: [TAGS.dynamicSubcommand] }),
  fragment('G=git; $G push', { tags: [TAGS.dynamicHead] }),
  fragment('G=git; $G status', { tags: [TAGS.dynamicHead] }),
  fragment('X=echo; $X push', { tags: [TAGS.dynamicHead] }),
  fragment('$(echo git) push', { tags: [TAGS.dynamicHead] }),
  fragment('`echo git` diff', { tags: [TAGS.dynamicHead] }),
  fragment('$(echo true) push', { tags: [TAGS.dynamicHead] }),
  fragment('P=push; git $P'),
  fragment('git $(echo push)'),
  fragment('echo git push', { tags: [TAGS.anyWordAnchor] }),
  fragment('echo git status', { tags: [TAGS.anyWordAnchor] }),
  fragment('git push \'x', { tags: [TAGS.unterminated], status: 2 }),
  fragment('git status "x', { tags: [TAGS.unterminated], status: 2 }),
  fragment('echo $(git push', { tags: [TAGS.unterminated], status: 2 }),
  fragment(`echo ${'$(echo '.repeat(OVER_NESTING)}git push${')'.repeat(OVER_NESTING)}`, { tags: [TAGS.overNested] }),
  fragment("$'\\x67it' push origin main"),
  fragment("$'\\147it' push"),
  fragment("git $'pu\\163h'"),
  fragment("git $'\\x64iff'"),
  fragment('$"git" push'),
  fragment("bash -c $'echo x\\ngit push'", { tags: [TAGS.opaqueString] }),
  fragment("eval $'git\\x20push'", { tags: [TAGS.opaqueString] }),
  fragment('{git,push} origin'),
  fragment('git {push,x}'),
  fragment('{git,-C,.,reset,--hard}'),
  fragment('{git,diff}'),
  fragment('git pus[h] origin', { tags: [TAGS.patternWord] }),
  fragment('echo {push,x}', { tags: [TAGS.patternWord] }),
  fragment('gi[t] push', { tags: [TAGS.patternWord] }),
  fragment('echo ${#x}; git push\necho }'),
  fragment('(( x = 1 << 2 ))\ngit push', { tags: [TAGS.arithmeticHeredoc] }),
  fragment("bash -o pipefail -c 'git push'"),
  fragment("bash -O extglob -c 'git push'"),
  fragment("bash +e -c 'git push'"),
  fragment("env -S'git push'"),
  fragment("env -u X -S 'git push'"),
  fragment('G=git; command $G push'),
  fragment('G=git; exec $G push'),
  fragment('G=git; nohup $G push'),
  fragment('G=git; command $G diff'),
  fragment('echo "$HOME" show', { tags: [TAGS.dynamicBeforeVerb] }),
  fragment('git-push origin main', { tags: [TAGS.dashedBuiltin], status: 127 }),
  fragment('"$(git --exec-path)"/git-push origin main', { tags: [TAGS.dashedBuiltin], status: 127 }),
  fragment('GIT_CONFIG_KEY_0=alias.x git x', { tags: [TAGS.configChannel] }),
  fragment('GIT_CONFIG_VALUE_0=push git x', { tags: [TAGS.configChannel] }),
  fragment('git -c include.path=f status', { tags: [TAGS.configChannel] }),
  fragment("alias p='git push'", { tags: [TAGS.configChannel] }),
  fragment('git add src/*.js'),
  fragment('git commit -m "fix {a,b}"'),
  fragment("git log --grep '*'"),
  fragment("echo $'hello'"),
  fragment('ls *.md'),
  fragment("bash -lc 'git status'"),
  fragment(`echo push ${RESIDUAL_MARKER} | xargs git`, { tags: [TAGS.residual] }),
  fragment(`echo 'git push ${RESIDUAL_MARKER}' | sh`, { tags: [TAGS.residual] }),
  fragment(`printf 'git reset --hard ${RESIDUAL_MARKER}\\n' | bash`, { tags: [TAGS.residual] }),
]);

// ---------------------------------------------------------------- composers

function sequence(generator, rng, depth) {
  const left = generator.compose(rng, depth);
  const right = generator.compose(rng, depth);
  const op = left.lineEnd ? '\n' : pick(rng, [';', '&&', '||', '|', '\n']);
  const tags = mergedTags(left, right);
  const options = { tags, status: right.status, lineEnd: right.lineEnd, keywordLed: left.keywordLed };
  if (op === '&&' && left.status === 0) return fragment(`${left.text} && ${right.text}`, options);
  if (op === '||') return fragment(left.status === 0 ? `${left.text} ; false || ${right.text}` : `${left.text} || ${right.text}`, options);
  if (op === '|') return fragment(`${left.text} | ${right.keywordLed ? `{ ${closed(right, '; }')}` : right.text}`, options);
  return fragment(`${left.text}${op === '\n' ? '\n' : ' ; '}${right.text}`, options);
}

const GROUPERS = Object.freeze([
  inner => fragment(`( ${closed(inner, ')')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`{ ${closed(inner, '; }')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`! { ${closed(inner, '; }')}`, { ...inner, status: inner.status === 0 ? 1 : 0, keywordLed: true }),
  inner => fragment(`time ${inner.text}`, { ...inner, keywordLed: true }),
  inner => fragment(`if true; then ${closed(inner, '; fi')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`case x in (x) ${closed(inner, ';; esac')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`f() { ${closed(inner, '; }')}; f`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`for i in 1; do ${closed(inner, '; done')}`, { tags: inner.tags, status: inner.status }),
]);

function group(generator, rng, depth) {
  const inner = generator.compose(rng, depth);
  return pick(rng, GROUPERS)(inner);
}

const BASHISMS = /\$'|<\(|<<<|\btime\b|\[\[/;
const canBacktick = inner => !inner.text.includes('`') && !inner.text.includes('\\$');
const SPLIT_SAFE = /^[\w .=/'"-]*$/;
const canDoubleQuote = inner => inner.simple && !/["$`\\!]/.test(inner.text);

function nestedForms(inner) {
  const forms = [
    () => fragment(`echo $( ${closed(inner, ')')}`, inner),
    () => fragment(`cat <( ${closed(inner, ')')}`, inner),
    () => fragment(`bash -c ${singleQuote(inner.text)}`, inner),
    () => fragment(`eval ${singleQuote(inner.text)}`, inner),
  ];
  if (canBacktick(inner) && !inner.lineEnd) forms.push(() => fragment(`echo \`${inner.text}\``, inner));
  if (!BASHISMS.test(inner.text)) forms.push(() => fragment(`sh -c ${singleQuote(inner.text)}`, inner));
  if (inner.simple && SPLIT_SAFE.test(inner.text)) forms.push(() => fragment(`env -S ${singleQuote(inner.text)}`, { ...inner, simple: false }), () => fragment(`eval ${inner.text}`, inner));
  if (canDoubleQuote(inner)) forms.push(() => fragment(`bash -c "${inner.text}"`, inner));
  return forms;
}

function nest(generator, rng, depth) {
  const inner = generator.compose(rng, depth);
  const nested = pick(rng, nestedForms(inner))();
  return fragment(nested.text, { tags: inner.tags, status: nested.status === 0 ? 0 : inner.status });
}

function heredoc(generator, rng, depth) {
  const inner = generator.compose(rng, depth);
  const delimiter = `EOF${generator.nextId()}`;
  const forms = [
    () => fragment(`cat <<'${delimiter}'\n${inner.text}\n${delimiter}`, { lineEnd: true }),
    () => fragment(`cat <<"${delimiter}"\n${inner.text}\n${delimiter}`, { lineEnd: true }),
    () => fragment(`cat <<${delimiter}\n$( ${closed(inner, ')')}\n${delimiter}`, { tags: inner.tags, lineEnd: true }),
    () => fragment(`cat <<-${delimiter}\n\t$( ${closed(inner, ')')}\n\t${delimiter}`, { tags: inner.tags, lineEnd: true }),
    () => fragment(`cat <<< "$( ${closed(inner, ')')}"`, { tags: inner.tags }),
  ];
  if (inner.simple) forms.push(() => fragment(`${inner.text} <<'${delimiter}'\nx\n${delimiter}`, { tags: inner.tags, lineEnd: true }));
  return pick(rng, forms)();
}

const COMPOSERS = Object.freeze([sequence, sequence, group, nest, nest, heredoc]);

function createGenerator() {
  let counter = 0;
  const generator = {
    nextId: () => counter++,
    compose: (source, depth) => {
      if (depth === 0 || source() < LEAF_ODDS) return source() < SPECIAL_ODDS ? pick(source, SPECIALS) : gitLeaf(source);
      return pick(source, COMPOSERS)(generator, source, depth - 1);
    },
  };
  return generator;
}

function generateCommands(seed, cap) {
  const rng = mulberry32(seed);
  const generator = createGenerator(rng);
  const generated = Array.from({ length: cap - SPECIALS.length }, () => generator.compose(rng, MAX_DEPTH));
  return Object.freeze([...SPECIALS, ...generated]);
}

// ---------------------------------------------------------------- Leg A runner and oracle

const ORIGINAL_PATH = process.env.PATH;

function findOnPath(name) {
  for (const dir of ORIGINAL_PATH.split(delimiter)) {
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

function withTree(act) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), TREE_PREFIX)));
  const tree = { base, bin: join(base, 'bin'), home: join(base, 'home'), runs: join(base, 'runs'), repo: join(base, 'repo') };
  Object.values(tree).slice(1).forEach(dir => mkdirSync(dir));
  writeFileSync(join(tree.bin, 'git'), STUB_GIT, { mode: EXECUTABLE_MODE });
  return act(tree).finally(() => rmSync(base, { recursive: true, force: true }));
}

async function mapPool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: POOL_SIZE }, lane));
  return results;
}

function parseArgvLog(text) {
  const fields = text.split(NUL);
  fields.pop();
  const argvs = [];
  for (let at = 0; at < fields.length; at += Number(fields[at]) + 1) {
    argvs.push(fields.slice(at + 1, at + 1 + Number(fields[at])));
  }
  return argvs;
}

function readLog(path) {
  try {
    return parseArgvLog(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function runInShell(shell, command, tree, index) {
  const dir = join(tree.runs, String(index));
  mkdirSync(dir);
  const log = join(dir, 'argv.log');
  const env = { PATH: `${tree.bin}${delimiter}${ORIGINAL_PATH}`, HOME: tree.home, FUZZ_LOG: log };
  return new Promise((resolve, reject) => {
    const child = spawn(shell, ['-c', command], { cwd: dir, env, stdio: ['ignore', 'ignore', 'pipe'], timeout: SPAWN_TIMEOUT_MS });
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stderr: Buffer.concat(stderr).toString(), argvs: readLog(log) }));
  });
}

// ---- independent argv-level judge: no shell parsing, no predicate code, a deliberately minimal verb table.

const ARGV_END = '--';
const HARD_OPTION = '--hard';
const hasOptionPrefix = (word, option) => word.length >= '--h'.length && word.startsWith('--') && option.startsWith(word);
const beforeEnd = args => (args.includes(ARGV_END) ? args.slice(0, args.indexOf(ARGV_END)) : args);
const clusterOf = word => (/^-[A-Za-z]+$/.test(word) ? word.slice(1) : '');
const clusterHas = (args, letter) => args.some(word => clusterOf(word).includes(letter));
const prefixHas = (args, option) => args.some(word => hasOptionPrefix(word, option));

function cleanRuns(args) {
  let dry = false;
  let valueNext = false;
  for (const word of args) {
    if (valueNext) {
      valueNext = false;
      continue;
    }
    if (word.length >= '--no-d'.length && '--no-dry-run'.startsWith(word)) dry = false;
    else if (word.length >= '--dry'.length && '--dry-run'.startsWith(word)) dry = true;
    else if (hasOptionPrefix(word, '--exclude')) valueNext = true;
    else if (clusterOf(word) !== '') {
      const letters = clusterOf(word);
      const cut = letters.indexOf('e');
      const flags = cut === -1 ? letters : letters.slice(0, cut);
      if (flags.includes('n')) dry = true;
      valueNext = cut === letters.length - 1;
    }
  }
  return !dry;
}

function branchDeletesHard(args) {
  const deletes = clusterHas(args, 'd') || prefixHas(args, '--delete');
  const forces = clusterHas(args, 'f') || prefixHas(args, '--force');
  return clusterHas(args, 'D') || (deletes && forces);
}

const DESTRUCTIVE_VERBS = Object.freeze({
  push: () => true,
  reset: args => args.some(word => hasOptionPrefix(word, HARD_OPTION)),
  clean: cleanRuns,
  branch: branchDeletesHard,
});
const SNIFFED = Object.keys(DESTRUCTIVE_VERBS);
const CONFIG_KEY = /^(alias\..*|include\.path|includeif\..*)$/;

const injectsConfigKey = normalised => normalised.kind === 'subcommand' && normalised.configKeys.some(key => CONFIG_KEY.test(key));

function lastExtDiffSetting(args) {
  return beforeEnd(args).findLast(word => word === '--ext-diff' || word === '--no-ext-diff');
}

function judgeArgv(argv) {
  const normalised = normaliseGitArgv(argv);
  const configured = injectsConfigKey(normalised);
  if (normalised.kind === 'refused') return { destructive: SNIFFED.some(verb => normalised.rest.includes(verb)), extDiff: false };
  if (normalised.kind !== 'subcommand') return { destructive: false, extDiff: false };
  const args = beforeEnd(normalised.args);
  const destructive = DESTRUCTIVE_VERBS[normalised.subcommand]?.(args) ?? false;
  const diffs = normalised.subcommand === 'diff' || normalised.subcommand === 'show';
  return { destructive: configured || destructive, extDiff: configured || (diffs && lastExtDiffSetting(args) !== '--no-ext-diff') };
}

const survivingArgvs = argvs => argvs.filter(argv => !argv.includes(RESIDUAL_MARKER));

const oracleVerdict = argvs =>
  survivingArgvs(argvs).map(judgeArgv).reduce(
    (total, one) => ({ destructive: total.destructive || one.destructive, extDiff: total.extDiff || one.extDiff }),
    { destructive: false, extDiff: false }
  );

const predicateVerdict = command => ({ destructive: gitDestructivePredicate(command).block, extDiff: gitExtDiffPredicate(command).block });

// A false block is judged on the union: an indeterminate command is denied fail-closed by both predicates.
const anyBlocks = verdict => verdict.destructive || verdict.extDiff;

function problemsOf(entry, run) {
  const problems = [];
  const predicate = predicateVerdict(entry.text);
  const oracle = oracleVerdict(run.argvs);
  const tagged = tag => entry.tags.includes(tag);
  const falseAllows = ['destructive', 'extDiff'].filter(kind => oracle[kind] && !predicate[kind]);
  const falseBlock = anyBlocks(predicate) && !anyBlocks(oracle);
  if (run.signal !== null) problems.push(`shell was killed (${run.signal})`);
  if (SYNTAX_ERROR.test(run.stderr) && !tagged(TAGS.unterminated)) problems.push(`generator emitted invalid shell: ${run.stderr.trim().replaceAll('\n', ' / ')}`);
  if (falseAllows.length > 0) problems.push(`FALSE ALLOW (${falseAllows.join(', ')}): bash ran a blocked git argv and the predicate allowed it`);
  if (!gitInvocations(entry.text).parsed && !PARSE_FAILURE_TAGS.some(tagged)) problems.push('parsed:false on a command that is not unterminated or over-nested');
  if (falseBlock && !SHELL_REJECTED.test(run.stderr) && !FALSE_BLOCK_TAGS.some(tagged)) problems.push('unexpected false block (no intended-false-block class)');
  return problems;
}

function judgeRun(entry, run) {
  const predicate = predicateVerdict(entry.text);
  const oracle = oracleVerdict(run.argvs);
  const falseBlock = anyBlocks(predicate) && !anyBlocks(oracle);
  return {
    problems: problemsOf(entry, run),
    invoked: run.argvs.length > 0,
    falseBlockTags: falseBlock ? entry.tags.filter(tag => FALSE_BLOCK_TAGS.includes(tag)) : [],
  };
}

async function fuzzShell(shell, commands) {
  return withTree(async tree => {
    const runs = await mapPool(commands, (entry, index) => runInShell(shell, entry.text, tree, index));
    return commands.map((entry, index) => judgeRun(entry, runs[index]));
  });
}

const failureReport = (commands, verdicts) =>
  verdicts
    .flatMap((verdict, index) => verdict.problems.map(problem => `${problem} :: ${JSON.stringify(commands[index].text)}`))
    .join('\n');

function countBy(items) {
  return items.reduce((counts, item) => ({ ...counts, [item]: (counts[item] ?? 0) + 1 }), {});
}

// ---------------------------------------------------------------- Leg B

const VALUE_CHOICES = Object.freeze({
  '-C': ['.', 'x', 'x', '/x', 'HEAD'],
  '-c': ['k.v=1', 'k.v=HOME', 'k.v'],
  '--git-dir': ['.git', '.git', 'x', '/x'],
  '--work-tree': ['.', 'x'],
  '--namespace': ['x', 'k.v=1'],
  '--config-env': ['k.v=HOME', 'k.v=1'],
  '--attr-source': ['HEAD', 'x'],
});
const LEG_B_FLAGS = Object.freeze([
  '--no-pager', '-p', '-P', '--paginate', '--no-optional-locks', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs', '--no-replace-objects', '--no-lazy-fetch', '--no-advice', '--bare', '--exec-path=x', '--exec-path',
  '--html-path', '--list-cmds=main',
]);
const LEG_B_INVALID = Object.freeze([['--frobnicate'], ['-C.'], ['--'], ['--super-prefix=x/'], ['--list-cmds']]);

function valueOption(rng) {
  const name = pick(rng, Object.keys(VALUE_CHOICES));
  const value = pick(rng, VALUE_CHOICES[name]);
  if (name === '-C' || name === '-c' || rng() < 0.5) return [name, value];
  return [`${name}=${value}`];
}

function legBOption(rng) {
  const choice = rng();
  if (choice < 0.4) return valueOption(rng);
  if (choice < 0.8) return [pick(rng, LEG_B_FLAGS)];
  return pick(rng, LEG_B_INVALID);
}

function legBSequences(seed, cap) {
  const rng = mulberry32(seed);
  return Array.from({ length: cap }, () => {
    const options = Array.from({ length: 1 + Math.floor(rng() * MAX_LEG_B_OPTIONS) }, () => legBOption(rng)).flat();
    return Object.freeze([...options, SENTINEL_SUBCOMMAND]);
  });
}

const TRACE_BUILTIN = /trace: built-in: git (\S+)/;
const UNKNOWN_OPTION = /unknown option/;
const FATAL = /^(fatal|error):/m;

function classifyTrace(stderr) {
  const ran = TRACE_BUILTIN.exec(stderr);
  if (ran) return { kind: 'subcommand', subcommand: ran[1] };
  if (UNKNOWN_OPTION.test(stderr)) return { kind: 'refused' };
  if (FATAL.test(stderr)) return { kind: 'died' };
  return { kind: 'no-subcommand' };
}

function makeRepo(gitPath, tree) {
  const env = { PATH: ORIGINAL_PATH, HOME: tree.home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  const run = args => execFileSync(gitPath, args, { cwd: tree.repo, env, stdio: 'ignore' });
  run(['init', '-q']);
  run(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'e']);
  mkdirSync(join(tree.repo, 'x'));
  return env;
}

function runGit(gitPath, argv, tree, baseEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, argv, { cwd: tree.repo, env: { ...baseEnv, GIT_TRACE: '1' }, stdio: ['ignore', 'ignore', 'pipe'], timeout: SPAWN_TIMEOUT_MS });
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', () => resolve(classifyTrace(Buffer.concat(stderr).toString())));
  });
}

const UNSAFE_MISMATCH = (git, normalised) =>
  git.kind === 'subcommand' && (normalised.kind !== 'subcommand' || normalised.subcommand !== git.subcommand);

function legBProblem(git, normalised, strict) {
  if (git.kind === 'died') return null;
  if (!strict) return UNSAFE_MISMATCH(git, normalised) ? 'git ran a subcommand the normaliser did not report' : null;
  const sameKind = git.kind === normalised.kind;
  const sameSubcommand = git.kind !== 'subcommand' || git.subcommand === normalised.subcommand;
  return sameKind && sameSubcommand ? null : 'normaliser disagrees with git';
}

// ---------------------------------------------------------------- shells

function bashMajor(path) {
  const match = /version (\d+)/.exec(execFileSync(path, ['--version'], { encoding: 'utf8' }));
  return match ? Number(match[1]) : 0;
}

function secondBash() {
  const system = realpathSync(SANITY_BASH);
  for (const dir of ORIGINAL_PATH.split(delimiter)) {
    const candidate = join(dir, 'bash');
    try {
      if (realpathSync(candidate) !== system && bashMajor(candidate) >= MIN_SECOND_BASH_MAJOR) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

const COMMANDS_BY_SEED = SEEDS.map(seed => ({ seed, commands: generateCommands(seed, CAP) }));
const SECOND_BASH = secondBash();

describe('shell-git-invocations — Leg B comparison rule', () => {
  const subcommand = name => ({ kind: 'subcommand', subcommand: name });
  const rows = [
    ['agree on the subcommand, strict', subcommand('rev-parse'), subcommand('rev-parse'), true, null],
    ['disagree on the subcommand, strict', subcommand('rev-parse'), subcommand('push'), true, 'normaliser disagrees with git'],
    ['disagree on the subcommand, unsafe-direction', subcommand('rev-parse'), subcommand('push'), false, 'git ran a subcommand the normaliser did not report'],
    ['agree on refused, strict', { kind: 'refused' }, { kind: 'refused' }, true, null],
    ['git refused but the normaliser reports a subcommand, strict', { kind: 'refused' }, subcommand('rev-parse'), true, 'normaliser disagrees with git'],
    ['git refused but the normaliser reports a subcommand, unsafe-direction', { kind: 'refused' }, subcommand('rev-parse'), false, null],
    ['git ran a subcommand the normaliser refused, strict', subcommand('rev-parse'), { kind: 'refused' }, true, 'normaliser disagrees with git'],
    ['git ran a subcommand the normaliser refused, unsafe-direction', subcommand('rev-parse'), { kind: 'refused' }, false, 'git ran a subcommand the normaliser did not report'],
    ['agree on no-subcommand, strict', { kind: 'no-subcommand' }, { kind: 'no-subcommand' }, true, null],
    ['git ran nothing but the normaliser reports a subcommand, strict', { kind: 'no-subcommand' }, subcommand('push'), true, 'normaliser disagrees with git'],
    ['git ran nothing but the normaliser reports a subcommand, unsafe-direction', { kind: 'no-subcommand' }, subcommand('push'), false, null],
    ['git ran a subcommand the normaliser found none for, strict', subcommand('rev-parse'), { kind: 'no-subcommand' }, true, 'normaliser disagrees with git'],
    ['git died, strict', { kind: 'died' }, subcommand('push'), true, null],
    ['git died, unsafe-direction', { kind: 'died' }, { kind: 'refused' }, false, null],
  ];
  for (const [name, git, normalised, strict, expected] of rows) {
    it(`Given ${name}, when compared, then the verdict is ${expected ?? 'agreement'}`, () => {
      const sut = legBProblem;

      const result = sut(git, normalised, strict);

      assert.equal(result, expected);
    });
  }
});

describe('shell-git-invocations — differential fuzz against bash and git', { concurrency: true }, () => {
  it('Given the fixed seeds, when the commands are generated twice, then both lists are identical', () => {
    const sut = generateCommands;

    for (const { seed, commands } of COMMANDS_BY_SEED) {
      const result = sut(seed, CAP).map(entry => entry.text);

      assert.deepEqual(result, commands.map(entry => entry.text));
      assert.equal(result.length, CAP);
    }
  });

  it('Given the generated commands, when their tags are counted, then every false-block class and the residual class is reached', () => {
    const sut = COMMANDS_BY_SEED.flatMap(({ commands }) => commands);

    const result = countBy(sut.flatMap(entry => entry.tags));

    for (const tag of Object.values(TAGS)) assert.ok((result[tag] ?? 0) > 0, `generator never reached ${tag}`);
  });

  for (const { seed, commands } of COMMANDS_BY_SEED) {
    for (const [name, shell] of [['/bin/bash', SANITY_BASH], ['the first bash >= 5 on PATH', SECOND_BASH]]) {
      it(
        `Given every command of seed ${seed}, when ${name} runs it against a stub git, then the predicates never allow what bash ran`,
        { timeout: FUZZ_TIMEOUT_MS, skip: shell === null ? 'no second bash >= 5 on PATH' : false },
        async t => {
          const sut = fuzzShell;

          const result = await sut(shell, commands);

          const invoked = result.filter(verdict => verdict.invoked).length;
          t.diagnostic(`generated ${commands.length}, invoked ${invoked}, false blocks ${JSON.stringify(countBy(result.flatMap(verdict => verdict.falseBlockTags)))}`);
          const report = failureReport(commands, result);
          assert.ok(report === '', `\n${report}`);
          assert.ok(invoked >= INVOKED_FLOOR, `only ${invoked} commands logged a git argv`);
        }
      );
    }

    it(
      `Given random sequences of git global options from seed ${seed}, when real git traces them, then the normaliser never misses the subcommand git ran`,
      { timeout: FUZZ_TIMEOUT_MS },
      async t => {
        const gitPath = findOnPath('git');
        const strict = STRICT_GIT_VERSION.test(execFileSync(gitPath, ['--version'], { encoding: 'utf8' }));
        const sequences = legBSequences(seed, LEG_B_CAP);

        const outcomes = await withTree(async tree => {
          const env = makeRepo(gitPath, tree);
          return mapPool(sequences, async argv => ({ argv, git: await runGit(gitPath, argv, tree, env) }));
        });

        const problems = outcomes
          .map(({ argv, git }) => ({ argv, problem: legBProblem(git, normaliseGitArgv(argv), strict) }))
          .filter(({ problem }) => problem !== null)
          .map(({ argv, problem }) => `${problem}: git ${JSON.stringify(argv)}`);
        t.diagnostic(`strict ${strict}, git outcomes ${JSON.stringify(countBy(outcomes.map(({ git }) => git.kind)))}`);
        assert.deepEqual(problems, []);
        const kinds = new Set(outcomes.map(({ git }) => git.kind));
        for (const kind of ['subcommand', 'refused', 'no-subcommand']) assert.ok(kinds.has(kind), `Leg B never reached ${kind}`);
      }
    );
  }
});
