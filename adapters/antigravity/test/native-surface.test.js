import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const AGENTS_DIR = join(ADAPTER_DIR, 'agents');
const SHARED_AGENTS_DIR = join(REPO_ROOT, 'agents');
const README_PATH = join(ADAPTER_DIR, 'README.md');
const CONFIG_TEMPLATE_PATH = join(ADAPTER_DIR, 'config.template.json');
const HOOKS_JSON_PATH = join(ADAPTER_DIR, 'plugins', 'craft', 'hooks.json');
const ENTRYPOINT_SKILL_PATH = join(ADAPTER_DIR, 'skills', 'craft-run', 'SKILL.md');
const SHARED_RUN_SKILL_PATH = join(REPO_ROOT, 'skills', 'run', 'SKILL.md');

const ROLES = [
  'backlog-ticker', 'designer', 'docs-writer', 'harness-triager', 'part-implementer',
  'planner', 'refactor-executor', 'requirements-writer', 'reviewer',
];

const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;
const SHELL_INJECTION_PATTERN = /!`[^`]*`/;
const ENTRYPOINT_LINE_BUDGET = 40;

/** Split a `---\n…\n---` frontmatter block into top-level attrs + body. No yaml dep. */
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') throw new Error('missing opening frontmatter fence');
  const closeIndex = lines.indexOf('---', 1);
  if (closeIndex === -1) throw new Error('missing closing frontmatter fence');

  const attrs = {};
  for (const line of lines.slice(1, closeIndex)) {
    const match = /^([a-zA-Z_-]+):\s?(.*)$/.exec(line);
    if (match) attrs[match[1]] = match[2].trim();
  }
  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  return { attrs, body };
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

describe('adapters/antigravity/skills/ — the entrypoint dir, never a copy of the shared tree', () => {
  it('Given the skills directory, when its entries are listed, then it contains exactly craft-run', () => {
    const sut = readdirSync(join(ADAPTER_DIR, 'skills'));

    assert.deepEqual(sut, ['craft-run']);
  });

  it('Given the repository-root skills tree, when skills/run/SKILL.md is checked, then it exists (entrypoint citation does not drift)', () => {
    const sut = existsSync(SHARED_RUN_SKILL_PATH);

    assert.ok(sut);
  });
});

describe('craft-<role>.md agent bodies — byte-identical to shared craft sources', () => {
  for (const role of ROLES) {
    it(`Given agent craft-${role}.md, when its body is compared to the shared craft source, then the two are byte-identical`, () => {
      const sut = bodyOf(agentPath(role));

      const result = bodyOf(sharedAgentPath(role));

      assert.equal(sut, result);
    });
  }
});

describe('craft-<role>.md — Antigravity agent frontmatter contract (name + description; no fabricated model)', () => {
  for (const role of ROLES) {
    it(`Given craft-${role}.md, when frontmatter is parsed, then name is craft-${role}`, () => {
      const sut = readDef(agentPath(role));

      assert.equal(sut.attrs.name, `craft-${role}`);
    });

    it(`Given craft-${role}.md, when frontmatter is parsed, then description is non-empty`, () => {
      const sut = readDef(agentPath(role));

      assert.ok(sut.attrs.description && sut.attrs.description.length > 0);
    });

    it(`Given craft-${role}.md, when frontmatter is parsed, then it carries NO model key (Gemini-fixed; override key unpinned)`, () => {
      const sut = readDef(agentPath(role));

      assert.equal(sut.attrs.model, undefined);
    });
  }
});

describe('plugins/craft/hooks.json — the PreToolUse guard registration', () => {
  it('Given hooks.json, when parsed, then its first PreToolUse entry matches the run_command tool', () => {
    const parsed = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));

    const sut = parsed.PreToolUse[0].matcher;

    assert.equal(sut, 'run_command');
  });

  it('Given hooks.json, when parsed, then the hook command invokes craft-guard.js as a type:command hook', () => {
    const parsed = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));

    const hook = parsed.PreToolUse[0].hooks[0];

    assert.equal(hook.type, 'command');
    assert.match(hook.command, /craft-guard\.js/);
  });

  it('Given hooks.json, when the command is scanned, then it references CRAFT_ROOT (the guard needs the engine checkout)', () => {
    const parsed = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));

    assert.match(parsed.PreToolUse[0].hooks[0].command, /\$\{CRAFT_ROOT\}/);
  });
});

describe('entrypoint skill — skills/craft-run/SKILL.md', () => {
  it('Given the entrypoint skill, when frontmatter is parsed, then it carries a non-empty name and description', () => {
    const sut = readDef(ENTRYPOINT_SKILL_PATH);

    assert.ok(sut.attrs.name && sut.attrs.name.length > 0);
    assert.ok(sut.attrs.description && sut.attrs.description.length > 0);
  });

  it('Given the entrypoint skill, when scanned, then it defers to skills/run/SKILL.md rather than restating the procedure', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /skills\/run\/SKILL\.md/);
  });

  it('Given the entrypoint skill, when scanned, then it names run_command (the pinned exec surface)', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /run_command/);
  });

  it('Given the entrypoint skill, when its line count is measured, then it stays under the small-file budget', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8').split('\n').length;

    assert.ok(sut < ENTRYPOINT_LINE_BUDGET, `entrypoint skill is ${sut} lines, expected < ${ENTRYPOINT_LINE_BUDGET}`);
  });
});

// Hygiene surfaces. Every authored adapter surface, no carve-out.
function agentBodies() {
  return ROLES.map((role) => ({ label: `agents/craft-${role}.md`, text: bodyOf(agentPath(role)) }));
}
function authoredSurfaces() {
  return [
    { label: 'README.md', text: readFileSync(README_PATH, 'utf8') },
    { label: 'config.template.json', text: readFileSync(CONFIG_TEMPLATE_PATH, 'utf8') },
    { label: 'plugins/craft/hooks.json', text: readFileSync(HOOKS_JSON_PATH, 'utf8') },
    { label: 'skills/craft-run/SKILL.md', text: readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8') },
  ];
}

describe('hygiene — no shell-injection expansion, over every authored surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when the text is scanned, then it carries no shell-injection expansion`, () => {
      assert.doesNotMatch(text, SHELL_INJECTION_PATTERN);
    });
  }
});

describe('hygiene — no phase/ADR/backlog reference, over every authored surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when the text is scanned, then it carries no phase/ADR/backlog reference`, () => {
      assert.doesNotMatch(text, PROVENANCE_REF);
    });
  }
});

describe('README.md — honesty pins (measured posture, not assumed)', () => {
  it('Given README.md, when scanned, then it states there is no headless execution port', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /no headless/i);
  });

  it('Given README.md, when scanned, then it states the guard deny wire is not live-verified', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /not live-verified/i);
  });

  it('Given README.md, when scanned, then it flags the env-var substitution in the hook command as unpinned', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /env-var|environment variable/i);
    assert.match(sut, /CRAFT_ROOT/);
  });

  it('Given README.md, when scanned, then it states the skill/agent loading path is not live-verified', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /\.agents\//);
    assert.match(sut, /OPEN|not live-verified/i);
  });
});
