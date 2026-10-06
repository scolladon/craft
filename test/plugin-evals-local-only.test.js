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
const EVAL_CLI_PATTERN = /\bplugin\s+eval\b/;
const EVALS_PATH_PATTERN = /\bevals\//;
const RESULTS_IGNORE_LINE = '/evals/results/';
const REQUIRED_FLAGS = ['--no-publish', '--max-cost-usd'];
const FORBIDDEN_FLAGS = ['--trust-plugin', '--publish-report'];

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const RUN_COMMAND_PATTERN = /\bclaude\s+plugin\s+eval\b/;
const INIT_COMMAND_PATTERN = /\bclaude\s+plugin\s+eval\s+init\b/;
const WORKFLOW_FILE_PATTERN = /\.ya?ml$/;

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
    const text = continued ? trimmed.slice(0, -1) : trimmed;
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

function ciSurfaces() {
  const workflows = fs.readdirSync(WORKFLOWS_DIR).filter(f => WORKFLOW_FILE_PATTERN.test(f));
  return [CI_SCRIPT, ...workflows.map(f => path.join(WORKFLOWS_DIR, f))].map(file => ({
    label: path.relative(ROOT, file),
    content: fs.readFileSync(file, 'utf8'),
  }));
}

test('Given .gitignore, when read, then it ignores the eval results directory', () => {
  const sut = fs.readFileSync(GITIGNORE, 'utf8').split('\n').map(l => l.trim());

  assert.ok(sut.includes(RESULTS_IGNORE_LINE));
});

test('Given a synthetic maintainer doc, when eval run commands are collected, then only fenced, continuation-joined, non-init commands count', () => {
  const markdown = [
    'Run `claude plugin eval . --runs 1` by hand.',
    '',
    '```bash',
    'claude plugin eval . --tag trigger \\',
    '  --no-publish --max-cost-usd 5',
    '```',
    '',
    '```bash',
    'claude plugin eval init --bare demo',
    '```',
  ].join('\n');

  const result = evalRunCommands(markdown);

  assert.strictEqual(result.length, 1);
  assert.ok(carriesFlag(result[0], '--no-publish'));
  assert.ok(carriesFlag(result[0], '--tag'));
});

test('Given docs/contributing/maintainer-smokes.md, when its fenced claude plugin eval commands are collected, then the set is non-empty and each carries --no-publish and --max-cost-usd', () => {
  const sut = evalRunCommands(fs.readFileSync(MAINTAINER_SMOKES, 'utf8'));

  const missing = sut.filter(c => !REQUIRED_FLAGS.every(f => carriesFlag(c, f)));

  assert.ok(sut.length > 0);
  assert.deepStrictEqual(missing, []);
});

test('Given the same commands, when scanned for CI-only or publishing flags, then none carries --trust-plugin or --publish-report', () => {
  const commands = evalRunCommands(fs.readFileSync(MAINTAINER_SMOKES, 'utf8'));

  const sut = (list) => list.filter(c => FORBIDDEN_FLAGS.some(f => carriesFlag(c, f)));

  assert.deepStrictEqual(sut(['claude plugin eval . --trust-plugin']), ['claude plugin eval . --trust-plugin']);
  assert.deepStrictEqual(sut(commands), []);
});

test('Given scripts/ci.sh and every .github/workflows file, when scanned, then none invokes the eval CLI or names an evals path', () => {
  const sut = ciSurfaces();

  const offenders = sut.filter(s => referencesEvals(s.content)).map(s => s.label);

  assert.ok(sut.length >= 2);
  assert.ok(sut.every(s => s.content.length > 0));
  assert.strictEqual(referencesEvals('claude plugin eval .'), true);
  assert.strictEqual(referencesEvals('run_suite process test'), false);
  assert.deepStrictEqual(offenders, []);
});
