import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_JSON_PATH = join(ADAPTER_DIR, 'hooks.json');
const CONFIG_TEMPLATE_PATH = join(ADAPTER_DIR, 'config.template.toml');
const SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
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
