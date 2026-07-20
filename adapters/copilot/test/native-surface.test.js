import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resolveCopilotModel, resolveCopilotEffort } from '../src/model-tier-map.js';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const AGENTS_DIR = join(ADAPTER_DIR, 'agents');
const SKILLS_DIR = join(ADAPTER_DIR, 'skills');
const SHARED_AGENTS_DIR = join(REPO_ROOT, 'agents');
const README_PATH = join(ADAPTER_DIR, 'README.md');
const COMMAND_PATH = join(ADAPTER_DIR, 'commands', 'craft-run.md');

const ROLE_TIERS = {
  designer: 'opus',
  planner: 'opus',
  reviewer: 'opus',
  'requirements-writer': 'opus',
  'part-implementer': 'sonnet',
  'harness-triager': 'sonnet',
  'docs-writer': 'sonnet',
  'refactor-executor': 'sonnet',
  'backlog-ticker': 'haiku',
};
const ROLES = Object.keys(ROLE_TIERS);

const PLUGIN_ROOT_SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
const PLUGIN_ROOT_TOKEN = /\$\{CLAUDE_PLUGIN_ROOT\}/;
const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;
const SHELL_INJECTION_PATTERN = /!`[^`]*`/;

/** Split a `---\n…\n---` frontmatter block into top-level attrs + body. No yaml dep. */
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
  for (const line of lines.slice(1, closeIndex)) {
    const match = /^([a-zA-Z_-]+):\s?(.*)$/.exec(line);
    if (match) {
      attrs[match[1]] = match[2].trim();
    }
  }

  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  return { attrs, body };
}

function readDef(filePath) {
  return parseFrontmatter(readFileSync(filePath, 'utf8'));
}

/** Read just the body of a frontmatter-fenced file (dedup'd byte-identity reader). */
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

describe('craft-<role>.md — frontmatter contract', () => {
  for (const role of ROLES) {
    it(`Given craft-${role}.md, when frontmatter is parsed, then description is non-empty`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.description;

      assert.ok(result && result.length > 0);
    });

    it(`Given craft-${role}.md, when frontmatter is parsed, then model is non-empty`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.model;

      assert.ok(result && result.length > 0);
    });

    it(`Given craft-${role}.md, when frontmatter is parsed, then effort is non-empty`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.effort;

      assert.ok(result && result.length > 0);
    });
  }
});

describe('craft-<role>.md — model/effort tier consistency with model-tier-map.js', () => {
  for (const [role, tier] of Object.entries(ROLE_TIERS)) {
    it(`Given role "${role}" pinned to tier "${tier}", when compared to resolveCopilotModel(), then the frontmatter model matches the tier map`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.model;

      assert.equal(result, resolveCopilotModel(tier));
    });

    it(`Given role "${role}" pinned to tier "${tier}", when compared to resolveCopilotEffort(), then the frontmatter effort matches the tier map`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.effort;

      assert.equal(result, resolveCopilotEffort(tier));
    });
  }
});

describe('adapters/copilot/skills/ — removed: shared craft skills load by reference from the repository root', () => {
  it('Given the adapter directory, when checking for a local skills/ tree, then none exists', () => {
    const sut = existsSync(SKILLS_DIR);

    assert.equal(sut, false);
  });
});

describe('README.md — launch contract: shared skills load by reference from the repository root', () => {
  it('Given README.md, when the Load section is scanned, then it documents the two-flag copilot invocation', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /copilot --plugin-dir <repo> --plugin-dir <repo>\/adapters\/copilot/);
  });

  it('Given README.md, when the Load section is scanned, then it names the repository root as the plugin dir carrying the shared skills', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /`--plugin-dir <repo>`.*repository root/);
  });

  it('Given README.md, when the Load section is scanned, then it states the shared skills load by reference, not by copy', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /by reference/);
  });
});

// Hygiene surfaces. Agent bodies, the command entrypoint, and the README are entirely
// adapter-authored — no shared-source content lives in this adapter anymore (shared skills
// load by reference from the repository root), so these checks apply uniformly, with no
// carve-out for any surface.
function agentBodies() {
  return ROLES.map((role) => ({ label: `agents/craft-${role}.md`, text: bodyOf(agentPath(role)) }));
}

function authoredSurfaces() {
  return [
    { label: 'commands/craft-run.md', text: readFileSync(COMMAND_PATH, 'utf8') },
    { label: 'README.md', text: readFileSync(README_PATH, 'utf8') },
  ];
}

describe('hygiene — no shell-injection expansion, over every surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when the text is scanned, then it carries no shell-injection expansion`, () => {
      const sut = text;

      assert.doesNotMatch(sut, SHELL_INJECTION_PATTERN);
    });
  }
});

describe('hygiene — no phase/ADR/backlog reference, over every surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when the text is scanned, then it carries no phase/ADR/backlog reference`, () => {
      const sut = text;

      assert.doesNotMatch(sut, PROVENANCE_REF);
    });
  }
});

describe('hygiene — ${CLAUDE_PLUGIN_ROOT} confined to the CRAFT_ROOT shim, over every surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when every CRAFT_ROOT shim occurrence is stripped, then no bare \${CLAUDE_PLUGIN_ROOT} token remains`, () => {
      const sut = text.split(PLUGIN_ROOT_SHIM).join('');

      assert.doesNotMatch(sut, PLUGIN_ROOT_TOKEN);
    });
  }
});

describe('commands/craft-run.md — entrypoint contract', () => {
  it('Given commands/craft-run.md, when the body is scanned, then it carries the $ARGUMENTS token', () => {
    const sut = readFileSync(COMMAND_PATH, 'utf8');

    assert.ok(sut.includes('$ARGUMENTS'));
  });

  it('Given commands/craft-run.md, when the body is scanned, then it instructs loading the shared run skill', () => {
    const sut = readFileSync(COMMAND_PATH, 'utf8');

    assert.match(sut, /skills\/run\/SKILL\.md/);
  });

  it('Given the repository root, when checking for the shared run skill, then skills/run/SKILL.md exists on disk', () => {
    const sut = join(REPO_ROOT, 'skills', 'run', 'SKILL.md');

    assert.ok(existsSync(sut), 'skills/run/SKILL.md must exist so the entrypoint reference does not drift');
  });
});
