import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseManifestContent } from '../../../engine/src/frontmatter.js';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ADAPTER_DIR, 'opencode.json');
const MANIFEST_PATH = join(ADAPTER_DIR, '.claude', 'workflow.md');

const TIERS = new Set(['opus', 'sonnet', 'haiku']);

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function readManifest() {
  return parseManifestContent(readFileSync(MANIFEST_PATH, 'utf8'));
}

describe('opencode.json — config template contract', () => {
  it('Given the shipped opencode.json, when read, then it parses as JSON', () => {
    const sut = readConfig;

    const result = sut();

    assert.equal(typeof result, 'object');
  });

  it('Given the parsed config, when checking $schema, then it points at the opencode schema', () => {
    const sut = readConfig();

    const result = sut.$schema;

    assert.equal(result, 'https://opencode.ai/config.json');
  });

  it('Given the parsed config, when checking subagent_depth, then it is pinned to 1', () => {
    const sut = readConfig();

    const result = sut.subagent_depth;

    assert.equal(result, 1);
  });

  it('Given the parsed config, when checking the plugin array, then it includes the git-guard.ts path', () => {
    const sut = readConfig();

    const result = sut.plugin;

    assert.ok(Array.isArray(result));
    assert.ok(result.includes('./plugins/git-guard.ts'));
  });

  it('Given the parsed config, when checking permission, then it has a task key', () => {
    const sut = readConfig();

    const result = sut.permission;

    assert.ok(result && typeof result === 'object');
    assert.ok('task' in result);
  });

  it('Given the parsed config, when checking permission, then it has a bash key', () => {
    const sut = readConfig();

    const result = sut.permission;

    assert.ok('bash' in result);
  });

  it('Given the parsed config, when checking instructions, then it is a non-empty array', () => {
    const sut = readConfig();

    const result = sut.instructions;

    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  });

  // opencode rejects a bare `command.<name>: {}` entry — a JSON command MUST carry a
  // `template`. craft's commands are the auto-discovered `.opencode/commands/*.md` files,
  // so opencode.json declares no `command`/`agent` map at all. This guards the regression
  // (a re-added empty command entry) that a live opencode surfaced.
  it('Given the parsed config, when it declares a command map, then every entry carries a non-empty string template', () => {
    const sut = readConfig();

    const commands = sut.command ?? {};

    for (const [name, entry] of Object.entries(commands)) {
      assert.equal(typeof entry.template, 'string', `command.${name} must have a string template or be absent`);
      assert.ok(entry.template.length > 0, `command.${name}.template must be non-empty`);
    }
  });
});

describe('.claude/workflow.md — provider-neutral manifest fixture', () => {
  it('Given the shipped manifest, when its frontmatter is parsed, then it returns a non-null object', () => {
    const sut = readManifest;

    const result = sut();

    assert.ok(result !== null && typeof result === 'object');
  });

  it('Given the parsed manifest, when checking gates.phase, then it is a non-empty string', () => {
    const sut = readManifest();

    const result = sut.gates?.phase;

    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('Given the parsed manifest, when models values are present, then each is a bare tier string', () => {
    const sut = readManifest();

    const models = sut.models ?? {};
    const values = Object.values(models);

    assert.ok(values.length > 0, 'fixture should demonstrate at least one models.<role> tier entry');
    for (const value of values) {
      assert.ok(TIERS.has(value), `expected a bare tier string, got: ${value}`);
    }
  });

  it('Given the parsed manifest, when models values are present, then none contains a "/" (no provider/model leak)', () => {
    const sut = readManifest();

    const models = sut.models ?? {};
    const values = Object.values(models);

    for (const value of values) {
      assert.doesNotMatch(value, /\//);
    }
  });
});
