import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { normaliseGitArgv } from '../src/guards/git-argv.js';

const RESIDUAL_MARKER = 'residual-marker';
const POOL_SIZE = 8;
const SPAWN_TIMEOUT_MS = 5_000;
const MIN_SECOND_BASH_MAJOR = 5;
const OVER_NESTING = 9;
const MAX_DEPTH = 3;
const LEAF_ODDS = 0.35;
const SPECIAL_ODDS = 0.12;
const UINT32_RANGE = 2 ** 32;
const NUL = '\0';
const EXECUTABLE_MODE = 0o755;
const TREE_PREFIX = 'craft-git-fuzz-';
const SANITY_BASH = '/bin/bash';
const POSIX_SH = '/bin/dash';

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
  zshEquals: 'zsh-equals',
  braceInProcessSubstitution: 'brace-in-process-substitution',
  quoteInHeredocBody: 'quote-in-heredoc-body',
});
const FALSE_BLOCK_TAGS = Object.freeze([
  TAGS.unterminated, TAGS.overNested, TAGS.anyWordAnchor, TAGS.dynamicHead, TAGS.dynamicArg, TAGS.dynamicSubcommand,
  TAGS.patternWord, TAGS.dashedBuiltin, TAGS.configChannel, TAGS.dynamicBeforeVerb, TAGS.zshEquals,
  TAGS.braceInProcessSubstitution, TAGS.quoteInHeredocBody,
]);
// Both tags make bash 3.2 reject or mis-split the whole command, so the generator cannot vouch for its syntax.
const SYNTAX_EXEMPT_TAGS = Object.freeze([TAGS.unterminated, TAGS.quoteInHeredocBody]);
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

const fragment = (text, { tags = [], status = 0, simple = false, lineEnd = false, keywordLed = false, list = false } = {}) =>
  Object.freeze({ text, tags: Object.freeze([...tags]), status, simple, lineEnd, keywordLed, list });

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
  ['show', '--stat HEAD'], ['show', '--ext-diff'], ['show', '--no-ext-diff --ext-diff'],
  ['log', '-p --ext-diff'], ['log', '-p --ext-diff --no-ext-diff'], ['format-patch', '-1 --stdout --ext-diff'],
  ['config', 'alias.x diff'], ['config', '--get alias.x'], ['config', 'user.name x'],
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
  fragment('H=--hard; git reset $H', { tags: [TAGS.dynamicArg], list: true }),
  fragment('H=--soft; git reset $H', { tags: [TAGS.dynamicArg], list: true }),
  fragment('D=-D; git branch $D x', { tags: [TAGS.dynamicArg], list: true }),
  fragment('D=-d; git branch $D x', { tags: [TAGS.dynamicArg], list: true }),
  fragment('P=push; git $P HEAD', { tags: [TAGS.dynamicSubcommand], list: true }),
  fragment('D=diff; git $D HEAD', { tags: [TAGS.dynamicSubcommand], list: true }),
  fragment('S=status; git $S HEAD', { tags: [TAGS.dynamicSubcommand], list: true }),
  fragment('G=git; $G push', { tags: [TAGS.dynamicHead], list: true }),
  fragment('G=git; $G status', { tags: [TAGS.dynamicHead], list: true }),
  fragment('X=echo; $X push', { tags: [TAGS.dynamicHead], list: true }),
  fragment('$(echo git) push', { tags: [TAGS.dynamicHead] }),
  fragment('`echo git` diff', { tags: [TAGS.dynamicHead] }),
  fragment('$(echo true) push', { tags: [TAGS.dynamicHead] }),
  fragment('P=push; git $P', { list: true }),
  fragment('git $(echo push)'),
  fragment('=git push', { tags: [TAGS.zshEquals] }),
  fragment('=git status', { tags: [TAGS.zshEquals] }),
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
  fragment('echo ${#x}; git push\necho }', { list: true }),
  fragment('(( x = 1 << 2 ))\ngit push', { tags: [TAGS.arithmeticHeredoc], list: true }),
  fragment("bash -o pipefail -c 'git push'"),
  fragment("bash -O extglob -c 'git push'"),
  fragment("bash +e -c 'git push'"),
  fragment("env -S'git push'"),
  fragment("env -u X -S 'git push'"),
  fragment('G=git; command $G push', { list: true }),
  fragment('G=git; exec $G push', { list: true }),
  fragment('G=git; nohup $G push', { list: true }),
  fragment('G=git; command $G diff', { list: true }),
  fragment('X=--ext-diff; git show $X', { list: true }),
  fragment('G=git; command $G {di,show}ff', { list: true }),
  fragment('G="git diff"; $G show', { list: true }),
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
  fragment('echo *.md'),
  fragment("bash -lc 'git status || true'"),
  fragment(`echo push ${RESIDUAL_MARKER} | xargs git`, { tags: [TAGS.residual] }),
  fragment(`echo 'git push ${RESIDUAL_MARKER}' | sh`, { tags: [TAGS.residual] }),
  fragment(`printf 'git reset --hard ${RESIDUAL_MARKER}\\n' | bash`, { tags: [TAGS.residual] }),
  fragment('cat <( {git,push} origin )', { tags: [TAGS.braceInProcessSubstitution] }),
]);

// bash 3.2 rejects this whole command, so composed into another it would hide that one's git words from the oracle.
const STANDALONE_SPECIALS = Object.freeze([
  fragment('cat <<< "$( cat <<\'EOFQ\'\ngit status "x\nEOFQ\n)"', { tags: [TAGS.quoteInHeredocBody] }),
]);
const FIXED_ENTRIES = Object.freeze([...SPECIALS, ...STANDALONE_SPECIALS]);

// ---------------------------------------------------------------- composers

const pipedLeft = left => (left.simple ? left.text : `{ ${closed(left, '; }')} >/dev/null`);
const pipedRight = right => (right.keywordLed || right.list ? `{ ${closed(right, '; }')}` : right.text);

function sequence(generator, rng, depth) {
  const left = generator.compose(rng, depth);
  const right = generator.compose(rng, depth);
  const op = left.lineEnd ? '\n' : pick(rng, [';', '&&', '||', '|', '\n']);
  const tags = mergedTags(left, right);
  const options = { tags, status: right.status, lineEnd: right.lineEnd, keywordLed: left.keywordLed };
  const listOptions = { ...options, list: true };
  if (op === '&&' && left.status === 0) return fragment(`${left.text} && ${right.text}`, listOptions);
  if (op === '||') return fragment(left.status === 0 ? `${left.text} ; false || ${right.text}` : `${left.text} || ${right.text}`, listOptions);
  if (op === '|') return fragment(`${pipedLeft(left)} | ${pipedRight(right)}`, options);
  return fragment(`${left.text}${op === '\n' ? '\n' : ' ; '}${right.text}`, listOptions);
}

const GROUPERS = Object.freeze([
  inner => fragment(`( ${closed(inner, ')')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`{ ${closed(inner, '; }')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`! { ${closed(inner, '; }')}`, { ...inner, status: inner.status === 0 ? 1 : 0, keywordLed: true, simple: false, list: false }),
  inner => fragment(inner.keywordLed ? `time { ${closed(inner, '; }')}` : `time ${inner.text}`, { ...inner, keywordLed: true, simple: false }),
  inner => fragment(`if true; then ${closed(inner, '; fi')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(inner.keywordLed ? `case x in (x) { ${closed(inner, '; }')} ;; esac` : `case x in (x) ${closed(inner, ';; esac')}`, { tags: inner.tags, status: inner.status }),
  inner => fragment(`f() { ${closed(inner, '; }')}; f`, { tags: inner.tags, status: inner.status, list: true }),
  inner => fragment(`for i in 1; do ${closed(inner, '; done')}`, { tags: inner.tags, status: inner.status }),
]);

function group(generator, rng, depth) {
  const inner = generator.compose(rng, depth);
  return pick(rng, GROUPERS)(inner);
}

// `sh` is dash on Linux CI: a body carrying any bash-only construct (brace expansion, extglob,
// `((`, `$[`, `$"`, `|&`, `&>`) would run differently there than the guard's bash model.
const BRACE_EXPANSION = /\{[^{}\s]*(,|\.\.)[^{}\s]*\}/;
const BASHISMS = new RegExp(String.raw`\$'|\$"|\$\[|<\(|<<<|\btime\b|\[\[|\(\(|\|&|&>|[?*+@!]\(|${BRACE_EXPANSION.source}`);
const canBacktick = inner => !inner.text.includes('`') && !inner.text.includes('\\$');
const SPLIT_SAFE = /^[\w .=/'"-]*$/;
const canDoubleQuote = inner => inner.simple && !/["$`\\!]/.test(inner.text);

const processSubstitutionTags = inner =>
  BRACE_EXPANSION.test(inner.text) ? [...inner.tags, TAGS.braceInProcessSubstitution] : inner.tags;

function nestedForms(inner) {
  const forms = [
    () => fragment(`echo $( ${closed(inner, ')')}`, { ...inner, status: 0 }),
    () => fragment(`cat <( ${closed(inner, ')')}`, { ...inner, status: 0, tags: processSubstitutionTags(inner) }),
    () => fragment(`bash -c ${singleQuote(inner.text)}`, inner),
    () => fragment(`eval ${singleQuote(inner.text)}`, inner),
  ];
  if (canBacktick(inner) && !inner.lineEnd) forms.push(() => fragment(`echo \`${inner.text}\``, { ...inner, status: 0 }));
  if (!BASHISMS.test(inner.text)) forms.push(() => fragment(`sh -c ${singleQuote(inner.text)}`, inner));
  if (inner.simple && SPLIT_SAFE.test(inner.text)) forms.push(() => fragment(`env -S ${singleQuote(inner.text)}`, { ...inner, simple: false }), () => fragment(`eval ${inner.text}`, inner));
  if (canDoubleQuote(inner)) forms.push(() => fragment(`bash -c "${inner.text}"`, inner));
  return forms;
}

function nest(generator, rng, depth) {
  const inner = generator.compose(rng, depth);
  const nested = pick(rng, nestedForms(inner))();
  return fragment(nested.text, { tags: nested.tags, status: nested.status === 0 ? 0 : inner.status });
}

const quotedBodyTags = inner => (SYNTAX_EXEMPT_TAGS.some(tag => inner.tags.includes(tag)) ? [TAGS.quoteInHeredocBody] : []);

function heredoc(generator, rng, depth) {
  const inner = generator.compose(rng, depth);
  const delimiter = `EOF${generator.nextId()}`;
  const forms = [
    () => fragment(`cat <<'${delimiter}'\n${inner.text}\n${delimiter}`, { tags: quotedBodyTags(inner), lineEnd: true }),
    () => fragment(`cat <<"${delimiter}"\n${inner.text}\n${delimiter}`, { tags: quotedBodyTags(inner), lineEnd: true }),
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
  const generated = Array.from({ length: cap - FIXED_ENTRIES.length }, () => generator.compose(rng, MAX_DEPTH));
  return Object.freeze([...FIXED_ENTRIES, ...generated]);
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

// Linux CI resolves `sh` to dash while macOS resolves it to bash; pinning `sh` to dash where it
// exists makes a local run judge `sh -c` bodies the way CI does.
function linkPosixShell(bin) {
  try {
    accessSync(POSIX_SH, constants.X_OK);
  } catch {
    return;
  }
  symlinkSync(POSIX_SH, join(bin, 'sh'));
}

function withTree(act) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), TREE_PREFIX)));
  const tree = { base, bin: join(base, 'bin'), home: join(base, 'home'), runs: join(base, 'runs'), repo: join(base, 'repo') };
  Object.values(tree).slice(1).forEach(dir => mkdirSync(dir));
  writeFileSync(join(tree.bin, 'git'), STUB_GIT, { mode: EXECUTABLE_MODE });
  linkPosixShell(tree.bin);
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

const CONFIG_ARG_KEY = /^(alias|include|includeif|alias\..*|include\.path.*|includeif\..*)$/i;

const injectsConfigKey = normalised => normalised.kind === 'subcommand' && normalised.configKeys.some(key => CONFIG_KEY.test(key));

const namesConfigKey = normalised =>
  normalised.kind === 'subcommand' && normalised.subcommand === 'config' && normalised.args.some(word => CONFIG_ARG_KEY.test(word));

function lastExtDiffSetting(args) {
  return beforeEnd(args).findLast(word => word === '--ext-diff' || word === '--no-ext-diff');
}

function judgeArgv(argv) {
  const normalised = normaliseGitArgv(argv);
  const configured = injectsConfigKey(normalised) || namesConfigKey(normalised);
  if (normalised.kind === 'refused') return { destructive: SNIFFED.some(verb => normalised.rest.includes(verb)), extDiff: false };
  if (normalised.kind !== 'subcommand') return { destructive: false, extDiff: false };
  const args = beforeEnd(normalised.args);
  const destructive = DESTRUCTIVE_VERBS[normalised.subcommand]?.(args) ?? false;
  const diffs = normalised.subcommand === 'diff';
  const last = lastExtDiffSetting(args);
  const extDiff = configured || (diffs ? last !== '--no-ext-diff' : last === '--ext-diff');
  return { destructive: configured || destructive, extDiff };
}

const survivingArgvs = argvs => argvs.filter(argv => !argv.includes(RESIDUAL_MARKER));

const oracleVerdict = argvs =>
  survivingArgvs(argvs).map(judgeArgv).reduce(
    (total, one) => ({ destructive: total.destructive || one.destructive, extDiff: total.extDiff || one.extDiff }),
    { destructive: false, extDiff: false }
  );
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

export {
  FALSE_BLOCK_TAGS,
  NUL,
  ORIGINAL_PATH,
  PARSE_FAILURE_TAGS,
  RESIDUAL_MARKER,
  SANITY_BASH,
  SPAWN_TIMEOUT_MS,
  SYNTAX_EXEMPT_TAGS,
  TAGS,
  findOnPath,
  generateCommands,
  mapPool,
  mulberry32,
  oracleVerdict,
  parseArgvLog,
  pick,
  runInShell,
  secondBash,
  withTree,
  judgeArgv,
};
