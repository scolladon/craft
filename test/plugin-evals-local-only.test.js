'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');
const GITIGNORE = path.join(ROOT, '.gitignore');
const MAINTAINER_SMOKES = path.join(ROOT, 'docs', 'contributing', 'maintainer-smokes.md');
const SELF = __filename;
const EVAL_CLI_PATTERN = /\bplugin\s+eval\b/;
const EVALS_PATH_PATTERN = /\bevals\//;
const RESULTS_IGNORE_LINE = '/evals/results/';
const REQUIRED_FLAGS = ['--no-publish', '--max-cost-usd'];
const FORBIDDEN_FLAGS = ['--trust-plugin', '--publish-report'];

const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;
const RUN_COMMAND_PATTERN = /\bclaude\s+plugin\s+eval\b/;
const INIT_COMMAND_PATTERN = /\bclaude\s+plugin\s+eval\s+init\b/;
const WORKFLOW_FILE_PATTERN = /\.ya?ml$/;
const SHELL_SCRIPT_PATTERN = /\.sh$/;
const TEST_FILE_PATTERN = /\.test\.js$/;
const TEST_DIRS = [path.join(ROOT, 'test'), path.join(ROOT, 'engine', 'test')];
const ADAPTERS_DIR = path.join(ROOT, 'adapters');
const ADAPTER_TEST_PATTERN = /^[^/]+\/test\/.*\.test\.js$/;
const MIN_AGENT_FACING_SURFACES = 4;
const MIN_CI_SURFACES = 10;
const AGENT_FACING_GLOBS = [
  { dir: path.join(ROOT, 'skills'), pattern: /(^|\/)SKILL\.md$/ },
  { dir: path.join(ROOT, 'agents'), pattern: /^[^/]+\.md$/ },
  { dir: path.join(ROOT, 'docs', 'guides'), pattern: /\.md$/ },
];

function carriesFlag(command, flag) {
  return new RegExp(`(^|\\s)${flag}(\\s|=|$)`).test(command);
}

function closesFence(line, opener) {
  const match = FENCE_PATTERN.exec(line);
  if (!match) return false;
  const fence = match[1];
  return fence[0] === opener[0] && fence.length >= opener.length && line.slice(match[0].length).trim() === '';
}

function fencedLines(markdown) {
  const inside = [];
  let opener = null;
  for (const line of markdown.split('\n')) {
    if (opener === null) {
      const match = FENCE_PATTERN.exec(line);
      opener = match ? match[1] : null;
    } else if (closesFence(line, opener)) {
      opener = null;
    } else {
      inside.push(line);
    }
  }
  return inside;
}

function joinContinuations(lines) {
  const joined = [];
  let pending = '';
  for (const line of lines) {
    const trimmed = line.trimEnd();
    const continued = trimmed.endsWith('\\');
    const text = continued ? trimmed.slice(0, -1).trimEnd() : trimmed;
    pending = pending === '' ? text : `${pending} ${text.trimStart()}`;
    if (!continued) {
      joined.push(pending);
      pending = '';
    }
  }
  return pending === '' ? joined : [...joined, pending];
}

function evalRunCommands(markdown) {
  return joinContinuations(fencedLines(markdown)).filter(
    l => RUN_COMMAND_PATTERN.test(l) && !INIT_COMMAND_PATTERN.test(l),
  );
}

function referencesEvals(content) {
  return EVAL_CLI_PATTERN.test(content) || EVALS_PATH_PATTERN.test(content);
}

function filesUnder(dir, pattern) {
  return fs
    .readdirSync(dir, { recursive: true })
    .filter(f => pattern.test(f))
    .map(f => path.join(dir, f));
}

function surfaces(files) {
  return files.map(file => ({ label: path.relative(ROOT, file), content: fs.readFileSync(file, 'utf8') }));
}

function ciSurfaces() {
  const workflows = filesUnder(WORKFLOWS_DIR, WORKFLOW_FILE_PATTERN);
  const scripts = filesUnder(path.join(ROOT, 'scripts'), SHELL_SCRIPT_PATTERN);
  const tests = [
    ...TEST_DIRS.flatMap(dir => filesUnder(dir, TEST_FILE_PATTERN)),
    ...filesUnder(ADAPTERS_DIR, ADAPTER_TEST_PATTERN),
  ].filter(f => f !== SELF);
  return surfaces([...new Set([CI_SCRIPT, ...workflows, ...scripts, ...tests])]);
}

function agentFacingSurfaces() {
  const docs = AGENT_FACING_GLOBS.flatMap(({ dir, pattern }) => filesUnder(dir, pattern));
  return surfaces([path.join(ROOT, 'README.md'), ...docs]);
}

function missingRequiredFlags(commands) {
  return commands.filter(c => !REQUIRED_FLAGS.every(f => carriesFlag(c, f)));
}

function carryingForbiddenFlags(commands) {
  return commands.filter(c => FORBIDDEN_FLAGS.some(f => carriesFlag(c, f)));
}

test('Given .gitignore, when read, then it ignores the eval results directory', () => {
  const sut = fs.readFileSync(GITIGNORE, 'utf8').split('\n').map(l => l.trim());

  assert.ok(sut.includes(RESULTS_IGNORE_LINE));
});

test('Given a synthetic maintainer doc, when eval run commands are collected, then only fenced, continuation-joined, non-init commands count, indented fences included', () => {
  const markdown = [
    'Run `claude plugin eval . --runs 1` by hand.',
    '',
    '```bash',
    'claude plugin eval . --tag trigger \\',
    '  --no-publish --max-cost-usd 5',
    '```',
    '',
    '1. Step:',
    '    ```bash',
    '    claude plugin eval . --case x --no-publish --max-cost-usd 1',
    '    ```',
    '',
    '```bash',
    'claude plugin eval init --bare demo',
    '```',
  ].join('\n');

  const result = evalRunCommands(markdown);

  assert.deepStrictEqual(result, [
    'claude plugin eval . --tag trigger --no-publish --max-cost-usd 5',
    '    claude plugin eval . --case x --no-publish --max-cost-usd 1',
  ]);
});

test('Given synthetic commands, when checked for required flags, then a command lacking --no-publish or --max-cost-usd is reported', () => {
  const commands = [
    'claude plugin eval . --no-publish --max-cost-usd 5',
    'claude plugin eval . --max-cost-usd 5',
    'claude plugin eval . --no-publish',
  ];

  const result = missingRequiredFlags(commands);

  assert.deepStrictEqual(result, commands.slice(1));
});

test('Given synthetic commands, when checked for forbidden flags, then one carrying --trust-plugin or --publish-report is reported', () => {
  const commands = ['claude plugin eval . --trust-plugin', 'claude plugin eval . --publish-report', 'claude plugin eval . --no-publish'];

  const result = carryingForbiddenFlags(commands);

  assert.deepStrictEqual(result, commands.slice(0, 2));
});

test('Given docs/contributing/maintainer-smokes.md, when its fenced claude plugin eval commands are collected, then the set is non-empty and each carries --no-publish and --max-cost-usd', () => {
  const sut = evalRunCommands(fs.readFileSync(MAINTAINER_SMOKES, 'utf8'));

  const result = missingRequiredFlags(sut);

  assert.ok(sut.length > 0);
  assert.deepStrictEqual(result, []);
});

test('Given the same commands, when scanned for CI-only or publishing flags, then none carries --trust-plugin or --publish-report', () => {
  const sut = evalRunCommands(fs.readFileSync(MAINTAINER_SMOKES, 'utf8'));

  const result = carryingForbiddenFlags(sut);

  assert.deepStrictEqual(result, []);
});

test('Given README.md, the guides, skills and agents, when their fenced claude plugin eval commands are collected, then each carries the required flags and no forbidden one', () => {
  const sut = agentFacingSurfaces();

  const result = sut.flatMap(s => evalRunCommands(s.content));

  assert.ok(sut.length >= MIN_AGENT_FACING_SURFACES);
  assert.deepStrictEqual([...missingRequiredFlags(result), ...carryingForbiddenFlags(result)], []);
});

test('Given synthetic content, when checked for eval references, then the CLI and an evals path count and unrelated text does not', () => {
  const samples = ['claude plugin eval .', 'cat evals/x/prompt.md', 'run_suite process test'];

  const result = samples.map(referencesEvals);

  assert.deepStrictEqual(result, [true, true, false]);
});

test('Given scripts/ci.sh, every script, test file and .github/workflows file, when scanned, then none invokes the eval CLI or names an evals path, adapter suites included', () => {
  const sut = ciSurfaces();

  const result = sut.filter(s => referencesEvals(s.content)).map(s => s.label);

  assert.ok(sut.length >= MIN_CI_SURFACES);
  assert.ok(sut.every(s => s.content.length > 0));
  assert.ok(sut.some(s => s.label.startsWith(`adapters${path.sep}`)));
  assert.deepStrictEqual(result, []);
});
