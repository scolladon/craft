import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const CONFIG_PATH = join(ADAPTER_DIR, 'config.template.json');

const ROLES = [
  'designer',
  'planner',
  'reviewer',
  'requirements-writer',
  'part-implementer',
  'harness-triager',
  'docs-writer',
  'refactor-executor',
  'backlog-ticker',
];

const CRAFT_ROOT_PATH_PATTERN = /<CRAFT_ROOT>\/(\S+)/;

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

/** Every `<CRAFT_ROOT>/…` path referenced by the template's hook commands. */
function declaredCraftRootPaths(config) {
  const commands = (config.hooks?.preToolUse ?? []).map((hook) => hook.command ?? '');
  return commands
    .map((command) => CRAFT_ROOT_PATH_PATTERN.exec(command))
    .filter((match) => match !== null)
    .map((match) => match[1]);
}

describe('config.template.json — parses as JSON', () => {
  it('Given the shipped config template, when read, then it parses as JSON', () => {
    const sut = readConfig;

    const result = sut();

    assert.equal(typeof result, 'object');
  });
});

describe('config.template.json — preToolUse hook declared at user level', () => {
  it('Given the parsed config, when checking hooks.preToolUse, then it is a non-empty array', () => {
    const sut = readConfig();

    const result = sut.hooks?.preToolUse;

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  });

  it('Given the parsed config, when checking the preToolUse hook command, then it references hooks/craft-observer.js', () => {
    const sut = readConfig();

    const result = sut.hooks.preToolUse[0].command;

    assert.match(result, /hooks\/craft-observer\.js/);
  });

  it('Given the parsed config, when checking the preToolUse hook command, then it carries the <CRAFT_ROOT> placeholder', () => {
    const sut = readConfig();

    const result = sut.hooks.preToolUse[0].command;

    assert.match(result, /<CRAFT_ROOT>/);
  });

  it('Given the config template, when checking $comment, then it explains the <CRAFT_ROOT> substitution', () => {
    const sut = readConfig();

    const result = sut.$comment;

    assert.match(result, /<CRAFT_ROOT>/);
    assert.match(result, /substitut/i);
  });
});

describe('config.template.json — hooks stay enabled', () => {
  it('Given the parsed config, when checking disableAllHooks, then it is not true', () => {
    const sut = readConfig();

    const result = sut.disableAllHooks;

    assert.notEqual(result, true);
  });
});

describe('config.template.json — subagents.agents tier entries', () => {
  for (const role of ROLES) {
    it(`Given role "${role}", when checking subagents.agents, then craft-${role} is provider-neutral (model and effortLevel both "inherit")`, () => {
      const sut = readConfig();

      const result = sut.subagents?.agents?.[`craft-${role}`];

      assert.deepEqual(result, { model: 'inherit', effortLevel: 'inherit' });
    });
  }
});

describe('config.template.json — declared resource existence', () => {
  const config = readConfig();
  const declaredPaths = declaredCraftRootPaths(config);

  it('Given the config template, when scanning hook commands, then at least one <CRAFT_ROOT> path is declared', () => {
    assert.ok(declaredPaths.length > 0);
  });

  for (const declaredPath of declaredPaths) {
    it(`Given the config template, when resolving declared path "${declaredPath}", then it exists on disk`, () => {
      const sut = join(REPO_ROOT, declaredPath);

      const result = existsSync(sut);

      assert.ok(result, `${declaredPath} declared in config.template.json but missing on disk`);
    });
  }
});
