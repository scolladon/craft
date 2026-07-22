import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const AGENTS_DIR = join(ADAPTER_DIR, 'agents');
const SHARED_AGENTS_DIR = join(REPO_ROOT, 'agents');
const HOOKS_JSON_PATH = join(ADAPTER_DIR, 'hooks.json');
const GUARD_HOOK_PATH = join(ADAPTER_DIR, 'hooks', 'craft-guard.js');
const ENTRYPOINT_SKILL_PATH = join(ADAPTER_DIR, 'skills', 'craft-run', 'SKILL.md');
const SHARED_RUN_SKILL_PATH = join(REPO_ROOT, 'skills', 'run', 'SKILL.md');
const README_PATH = join(ADAPTER_DIR, 'README.md');
const CONFIG_TEMPLATE_PATH = join(ADAPTER_DIR, 'config.template.json');
const ENTRYPOINT_LINE_BUDGET = 40;

const ROLES = [
  'backlog-ticker',
  'designer',
  'docs-writer',
  'harness-triager',
  'part-implementer',
  'planner',
  'refactor-executor',
  'requirements-writer',
  'reviewer',
];

const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;
const SHELL_INJECTION_PATTERN = /!`[^`]*`/;

/** Split a `---\n…\n---` frontmatter block into ordered top-level keys, attrs, and body. */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') {
    throw new Error('missing opening frontmatter fence');
  }
  const closeIndex = lines.indexOf('---', 1);
  if (closeIndex === -1) {
    throw new Error('missing closing frontmatter fence');
  }

  const attrs = {};
  const keys = [];
  for (const line of lines.slice(1, closeIndex)) {
    const match = /^([a-zA-Z_-]+):\s?(.*)$/.exec(line);
    if (match) {
      attrs[match[1]] = match[2].trim();
      keys.push(match[1]);
    }
  }

  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  return { attrs, keys, body };
}

function readDef(filePath) {
  return parseFrontmatter(readFileSync(filePath, 'utf8'));
}

function bodyOf(filePath) {
  return readDef(filePath).body;
}

function agentPath(role) {
  return join(AGENTS_DIR, `craft-${role}.md`);
}

function sharedAgentPath(role) {
  return join(SHARED_AGENTS_DIR, `${role}.md`);
}

describe('craft-<role>.md agent bodies — byte-identical to shared craft sources', () => {
  for (const role of ROLES) {
    it(`Given agent craft-${role}.md, when its body is compared to the shared craft source, then the two are byte-identical`, () => {
      const sut = bodyOf(agentPath(role));

      const result = bodyOf(sharedAgentPath(role));

      assert.equal(sut, result);
    });
  }
});

describe('craft-<role>.md — frontmatter contract (Cursor .cursor/agents schema: name + description only)', () => {
  for (const role of ROLES) {
    it(`Given craft-${role}.md, when frontmatter is parsed, then name is craft-${role}`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.name;

      assert.equal(result, `craft-${role}`);
    });

    it(`Given craft-${role}.md, when frontmatter is parsed, then description is non-empty`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.description;

      assert.ok(result && result.length > 0);
    });

    // The live-pinned Cursor subagent schema (~/.cursor/skills-cursor/create-subagent)
    // documents exactly two frontmatter fields — name and description. A fabricated
    // per-agent `model`/`effort` field (the Antigravity lesson) is a schema the tool
    // rejects; the per-role tier rides the launch `--model` arg instead.
    it(`Given craft-${role}.md, when frontmatter keys are listed, then they are exactly [name, description]`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.keys;

      assert.deepEqual(result, ['name', 'description']);
    });
  }
});

describe('hooks.json — the .cursor/hooks.json manifest Cursor reads (live-pinned schema)', () => {
  it('Given hooks.json, when parsed, then it registers a beforeShellExecution command hook', () => {
    const sut = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));

    const hooks = sut.hooks.beforeShellExecution;

    assert.ok(Array.isArray(hooks) && hooks.length === 1);
    assert.ok(hooks[0].command.length > 0);
  });

  it('Given hooks.json, when parsed, then the guard hook is registered failClosed:true (measured: without it a crashing guard fails OPEN)', () => {
    const sut = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));

    const result = sut.hooks.beforeShellExecution[0].failClosed;

    assert.equal(result, true);
  });

  it('Given hooks.json, when its command is resolved, then it points at the adapter guard hook via the ${CRAFT_ROOT} env-subst (proven to resolve live)', () => {
    const sut = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));

    const command = sut.hooks.beforeShellExecution[0].command;

    assert.match(command, /\$\{CRAFT_ROOT\}/);
    assert.match(command, /adapters\/cursor\/hooks\/craft-guard\.js$/);
  });

  it('Given the command path in hooks.json, when stripped of the env-subst prefix, then the referenced guard file exists', () => {
    const command = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8')).hooks.beforeShellExecution[0].command;

    const relative = command.replace(/^node \$\{CRAFT_ROOT\}\//, '');
    const sut = join(REPO_ROOT, relative);

    assert.equal(sut, GUARD_HOOK_PATH);
    assert.ok(existsSync(sut));
  });
});

describe('entrypoint skill — skills/craft-run/SKILL.md (Cursor .cursor/skills schema)', () => {
  it('Given the entrypoint skill, when frontmatter is parsed, then it carries a non-empty name and description', () => {
    const sut = readDef(ENTRYPOINT_SKILL_PATH);

    assert.ok(sut.attrs.name && sut.attrs.name.length > 0);
    assert.ok(sut.attrs.description && sut.attrs.description.length > 0);
  });

  it('Given the entrypoint skill, when scanned, then it defers to skills/run/SKILL.md rather than restating the procedure', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /skills\/run\/SKILL\.md/);
  });

  it('Given the entrypoint skill, when scanned, then it resolves the pipeline manifest via the CRAFT_ROOT engine bin', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /pipeline-resolve\.js/);
    assert.match(sut, /\$\{CRAFT_ROOT\}/);
  });

  it('Given the entrypoint skill, when scanned, then it delegates to the craft role subagents and passes --model', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /craft-<role>|craft role subagent/i);
    assert.match(sut, /--model/);
  });

  it('Given the entrypoint skill, when its line count is measured, then it stays under the small-file budget (does not restate the procedure)', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8').split('\n').length;

    assert.ok(sut < ENTRYPOINT_LINE_BUDGET, `entrypoint skill is ${sut} lines, expected < ${ENTRYPOINT_LINE_BUDGET}`);
  });

  it('Given the repository-root shared run skill, when checked, then skills/run/SKILL.md exists so the citation does not drift', () => {
    assert.ok(existsSync(SHARED_RUN_SKILL_PATH));
  });
});

describe('README.md — measured-posture honesty pins', () => {
  it('Given README.md, when scanned, then it states the guard must stay failClosed:true (measured fail-open without it)', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /failClosed/);
    assert.match(sut, /fails? OPEN/i);
  });

  it('Given README.md, when scanned, then it states a malformed hooks.json fails open', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /malformed `?hooks\.json`? fails OPEN/i);
  });

  it('Given README.md, when scanned, then it states --sandbox is not a containment guarantee (measured)', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /--sandbox/);
    assert.match(sut, /not a containment guarantee/i);
  });

  it('Given README.md, when scanned, then it discloses there is no pre-write containment hook', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /no pre-write containment/i);
  });

  it('Given README.md, when scanned, then it documents the keychain-bound auth and the by-reference symlink load', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /keychain/i);
    assert.match(sut, /symlink/i);
  });
});

describe('config.template.json — valid, and carries the failClosed guard + model tiers', () => {
  it('Given the config template, when parsed, then it is valid JSON registering the failClosed guard', () => {
    const sut = JSON.parse(readFileSync(CONFIG_TEMPLATE_PATH, 'utf8'));

    assert.equal(sut.hooks.hooks.beforeShellExecution[0].failClosed, true);
  });

  it('Given the config template, when parsed, then its model tiers match the live-pinned ids', () => {
    const sut = JSON.parse(readFileSync(CONFIG_TEMPLATE_PATH, 'utf8'));

    assert.deepEqual(sut.models, {
      opus: 'claude-opus-4-8-high',
      sonnet: 'claude-sonnet-5-high',
      haiku: 'composer-2.5',
    });
  });
});

describe('hygiene — no provenance reference over the authored non-agent surfaces', () => {
  for (const label of ['hooks.json', 'skills/craft-run/SKILL.md', 'README.md', 'config.template.json']) {
    it(`Given ${label}, when scanned, then it carries no phase/ADR/backlog reference and no shell-injection expansion`, () => {
      const sut = readFileSync(join(ADAPTER_DIR, label), 'utf8');

      assert.doesNotMatch(sut, PROVENANCE_REF);
      assert.doesNotMatch(sut, SHELL_INJECTION_PATTERN);
    });
  }
});

describe('hygiene — agent bodies carry no shell-injection expansion and no provenance reference', () => {
  for (const role of ROLES) {
    it(`Given agent craft-${role}.md body, when scanned, then it carries no shell-injection expansion`, () => {
      const sut = bodyOf(agentPath(role));

      assert.doesNotMatch(sut, SHELL_INJECTION_PATTERN);
    });

    it(`Given agent craft-${role}.md body, when scanned, then it carries no phase/ADR/backlog reference`, () => {
      const sut = bodyOf(agentPath(role));

      assert.doesNotMatch(sut, PROVENANCE_REF);
    });
  }
});
