import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { delimiter, dirname, join } from 'node:path';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_JSON_PATH = join(ADAPTER_DIR, 'hooks.json');
const CONFIG_TEMPLATE_PATH = join(ADAPTER_DIR, 'config.template.toml');
const SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
const GUARD_COMMAND = `node "${SHIM}/adapters/codex/hooks/craft-guard.js"`;
const TEMPLATE_COMMAND_PATTERN = /^\s*command\s*=\s*'(.*)'\s*$/gm;
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const SPACED_ROOT_PREFIX = 'craft-codex-hook-root-';
const SPACED_ROOT_NAME = 'craft root';
const SHELLS = ['sh', 'bash'];
const GUARD_DENIED_EXIT = 2;
const BLOCKING_PAYLOAD = JSON.stringify({ cwd: '/repo', tool_name: 'exec_command', tool_input: { cmd: 'git diff' } });
const PINNED_TIER_MODELS = new Set(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.4-mini']);

function readHooksJson() {
  return readFileSync(HOOKS_JSON_PATH, 'utf8');
}

function readConfigTemplate() {
  return readFileSync(CONFIG_TEMPLATE_PATH, 'utf8');
}

describe('hooks.json — mandatory {description, hooks} wrapper', () => {
  it('Given hooks.json, when parsed, then it carries exactly the description and hooks top-level keys', () => {
    const parsed = JSON.parse(readHooksJson());

    const sut = Object.keys(parsed).sort();

    assert.deepEqual(sut, ['description', 'hooks']);
  });

  it('Given hooks.json, when the PreToolUse entry is read, then its handler is type "command" naming the craft-guard hook script', () => {
    const parsed = JSON.parse(readHooksJson());

    const sut = parsed.hooks.PreToolUse[0].hooks[0];

    assert.equal(sut.type, 'command');
    assert.match(sut.command, /adapters\/codex\/hooks\/craft-guard\.js/);
  });

  it('Given hooks.json, when its command template is scanned, then it uses the CRAFT_ROOT/CLAUDE_PLUGIN_ROOT shim and contains no bare CLAUDE_PLUGIN_ROOT', () => {
    const parsed = JSON.parse(readHooksJson());
    const sut = parsed.hooks.PreToolUse[0].hooks[0].command;

    assert.ok(sut.includes(SHIM));
    assert.equal(sut.split(SHIM).join('').includes('${CLAUDE_PLUGIN_ROOT}'), false);
  });
});

describe('config.template.toml — sandbox posture', () => {
  it('Given config.template.toml, when scanned, then it sets an explicit sandbox mode', () => {
    const sut = readConfigTemplate();

    assert.match(sut, /sandbox_mode\s*=\s*"workspace-write"/);
  });

  it('Given config.template.toml, when scanned, then it never names danger-full-access', () => {
    const sut = readConfigTemplate();

    assert.doesNotMatch(sut, /danger-full-access/);
  });
});

describe('config.template.toml — provider-neutral model vocabulary', () => {
  it('Given config.template.toml, when every gpt- literal is inspected, then each is one of the tier map\'s committed models', () => {
    const sut = readConfigTemplate();
    const matches = sut.match(/gpt-[A-Za-z0-9.-]+/g) ?? [];

    const result = matches.every((id) => PINNED_TIER_MODELS.has(id));

    assert.ok(result, `unpinned model id(s) found: ${matches.filter((id) => !PINNED_TIER_MODELS.has(id))}`);
  });
});

function registeredHooksJsonCommand() {
  return JSON.parse(readHooksJson()).hooks.PreToolUse[0].hooks[0].command;
}

function singleTemplateCommand() {
  const commands = [...readConfigTemplate().matchAll(TEMPLATE_COMMAND_PATTERN)].map(([, value]) => value);
  if (commands.length !== 1) {
    throw new Error(`config.template.toml registers ${commands.length} literal-string commands, expected exactly 1`);
  }
  return commands[0];
}

function withSpacedRoot(act) {
  const tmp = mkdtempSync(join(tmpdir(), SPACED_ROOT_PREFIX));
  try {
    const root = join(tmp, SPACED_ROOT_NAME);
    symlinkSync(REPO_ROOT, root);
    return act({ root, unrelated: tmp });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Built from scratch rather than inherited, so an ambient CRAFT_ROOT cannot stand
// in for the root the case under test is meant to supply.
function runRegisteredCommand(shell, command, rootEnv) {
  const path = [dirname(process.execPath), process.env.PATH].join(delimiter);
  return spawnSync(shell, ['-c', command], { input: BLOCKING_PAYLOAD, env: { PATH: path, ...rootEnv }, encoding: 'utf8' });
}

describe('the registered guard command — exact spelling', () => {
  it('Given hooks.json, when its PreToolUse command is read, then it is node and the whole guard path in one pair of double quotes', () => {
    const sut = registeredHooksJsonCommand();

    assert.equal(sut, GUARD_COMMAND);
  });
});

describe('the registered guard command — run by a shell from a plugin root containing a space', () => {
  const ROOT_SOURCES = [
    ['CLAUDE_PLUGIN_ROOT names that root and CRAFT_ROOT is unset', ({ root }) => ({ CLAUDE_PLUGIN_ROOT: root })],
    ['CRAFT_ROOT names that root and CLAUDE_PLUGIN_ROOT names another', ({ root, unrelated }) => ({ CLAUDE_PLUGIN_ROOT: unrelated, CRAFT_ROOT: root })],
  ];
  const REGISTRATIONS = [
    ['hooks.json', registeredHooksJsonCommand],
    ['config.template.toml', singleTemplateCommand],
  ];
  const MATRIX = SHELLS.flatMap((shell) =>
    REGISTRATIONS.flatMap(([registration, readCommand]) =>
      ROOT_SOURCES.map(([rootLabel, rootEnv]) => [shell, registration, readCommand, rootLabel, rootEnv])));

  for (const [shell, registration, readCommand, rootLabel, rootEnv] of MATRIX) {
    it(`Given ${rootLabel}, when ${shell} -c runs the ${registration} command on a blocking payload, then the guard itself denies it`, () => {
      withSpacedRoot((roots) => {
        const sut = runRegisteredCommand(shell, readCommand(), rootEnv(roots));

        assert.equal(sut.status, GUARD_DENIED_EXIT, sut.stderr);
        assert.match(sut.stderr, /--no-ext-diff/);
      });
    });
  }
});

const FEATURES_HEADER = '[features]';
const TABLE_HEADER_PATTERN = /^\s*\[/;
const TTY_OFF_LINE_PATTERN = /^\s*unified_exec_tty\s*=\s*false\s*$/;

function templateLines() {
  return readConfigTemplate().split('\n');
}

// Line-scoped on purpose: a whole-file match would also accept the key commented out
// or sitting under another table, where codex ignores it.
function featuresTableLines(lines) {
  const start = lines.findIndex((line) => line.trim() === FEATURES_HEADER);
  assert.notEqual(start, -1, `config.template.toml has no ${FEATURES_HEADER} table header`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => TABLE_HEADER_PATTERN.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

describe('config.template.toml - tty sessions off', () => {
  it('Given config.template.toml, when the [features] table is read up to the next table header, then it holds unified_exec_tty = false', () => {
    const sut = featuresTableLines(templateLines());

    const result = sut.some((line) => TTY_OFF_LINE_PATTERN.test(line));

    assert.ok(result, `the ${FEATURES_HEADER} table carries no unified_exec_tty = false line`);
  });

  it('Given config.template.toml, when every table header is collected, then [features] appears exactly once', () => {
    const sut = templateLines();

    const result = sut.filter((line) => line.trim() === FEATURES_HEADER);

    assert.equal(result.length, 1);
  });
});
