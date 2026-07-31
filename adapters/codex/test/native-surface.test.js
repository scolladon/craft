import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resolveCodexModel, resolveCodexEffort } from '../src/model-tier-map.js';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const AGENTS_DIR = join(ADAPTER_DIR, 'agents');
const SKILLS_DIR = join(ADAPTER_DIR, 'skills');
const SHARED_AGENTS_DIR = join(REPO_ROOT, 'agents');
const README_PATH = join(ADAPTER_DIR, 'README.md');
const CONFIG_TEMPLATE_PATH = join(ADAPTER_DIR, 'config.template.toml');
const HOOKS_JSON_PATH = join(ADAPTER_DIR, 'hooks.json');
const CRAFT_RULES_PATH = join(ADAPTER_DIR, 'craft.rules');
const MARKETPLACE_PATH = join(ADAPTER_DIR, '.claude-plugin', 'marketplace.json');
const LEGACY_MARKETPLACE_PATH = join(ADAPTER_DIR, 'marketplace.json');
const CRAFT_PLUGIN_PATH = join(ADAPTER_DIR, 'plugins', 'craft', 'plugin.json');
const CRAFT_CODEX_PLUGIN_PATH = join(ADAPTER_DIR, 'plugins', 'craft-codex', 'plugin.json');
const CRAFT_CODEX_SKILLS_DIR = join(ADAPTER_DIR, 'plugins', 'craft-codex', 'skills');
const ENTRYPOINT_SKILL_PATH = join(CRAFT_CODEX_SKILLS_DIR, 'craft-run', 'SKILL.md');
const SHARED_RUN_SKILL_PATH = join(REPO_ROOT, 'skills', 'run', 'SKILL.md');

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
const ENTRYPOINT_LINE_BUDGET = 40;

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

describe('adapters/codex/skills/ — must not exist: shared craft skills load by reference', () => {
  it('Given the codex adapter tree, when checked, then adapters/codex/skills/ does not exist', () => {
    const sut = existsSync(SKILLS_DIR);

    assert.equal(sut, false);
  });
});

describe('plugins/craft-codex/skills/ — the entrypoint dir, never a copy of the shared tree', () => {
  it('Given the craft-codex plugin skills directory, when its entries are listed, then it contains exactly craft-run', () => {
    const sut = readdirSync(CRAFT_CODEX_SKILLS_DIR);

    assert.deepEqual(sut, ['craft-run']);
  });
});

describe('plugins/craft/plugin.json — by-reference skills path', () => {
  it("Given the craft plugin manifest, when its declared skills path is resolved from the manifest's own directory, then it resolves to the repo-root skills/ directory", () => {
    const manifest = JSON.parse(readFileSync(CRAFT_PLUGIN_PATH, 'utf8'));
    const resolved = join(dirname(CRAFT_PLUGIN_PATH), manifest.skills);

    const sut = realpathSync(resolved);

    assert.equal(sut, realpathSync(join(REPO_ROOT, 'skills')));
  });

  it('Given the repository-root skills tree, when skills/run/SKILL.md is checked, then it exists', () => {
    const sut = existsSync(SHARED_RUN_SKILL_PATH);

    assert.ok(sut, 'skills/run/SKILL.md must exist so the entrypoint citation does not drift');
  });
});

describe('plugins/craft-codex/plugin.json — hooks path resolution', () => {
  it('Given the craft-codex plugin manifest, when its declared hooks path is resolved, then it resolves to adapters/codex/hooks.json', () => {
    const manifest = JSON.parse(readFileSync(CRAFT_CODEX_PLUGIN_PATH, 'utf8'));
    const resolved = join(dirname(CRAFT_CODEX_PLUGIN_PATH), manifest.hooks);

    const sut = realpathSync(resolved);

    assert.equal(sut, realpathSync(HOOKS_JSON_PATH));
  });
});

describe('marketplace.json — local file-backed, two entries', () => {
  it('Given the marketplace manifest, when its location is checked, then it lives at .claude-plugin/marketplace.json (the path codex reads), not the adapter root', () => {
    // codex 0.144.6 `plugin marketplace add <root>` only recognises a manifest at
    // <root>/.claude-plugin/marketplace.json; a root-level marketplace.json is
    // reported "marketplace root does not contain a supported manifest" (pinned live).
    assert.equal(existsSync(MARKETPLACE_PATH), true, 'manifest must be at .claude-plugin/marketplace.json');
    assert.equal(existsSync(LEGACY_MARKETPLACE_PATH), false, 'no dead root-level manifest may remain');
  });

  it('Given marketplace.json, when parsed, then every plugin entry declares source.source "local"', () => {
    const parsed = JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8'));

    const sut = parsed.plugins.map((p) => p.source.source);

    assert.deepEqual(sut, ['local', 'local']);
  });

  it('Given marketplace.json, when parsed, then it declares exactly the two entries craft and craft-codex', () => {
    const parsed = JSON.parse(readFileSync(MARKETPLACE_PATH, 'utf8'));

    const sut = parsed.plugins.map((p) => p.name).sort();

    assert.deepEqual(sut, ['craft', 'craft-codex']);
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
    it(`Given role "${role}" pinned to tier "${tier}", when compared to resolveCodexModel(), then the frontmatter model matches the tier map`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.model;

      assert.equal(result, resolveCodexModel(tier));
    });

    it(`Given role "${role}" pinned to tier "${tier}", when compared to resolveCodexEffort(), then the frontmatter effort matches the tier map`, () => {
      const sut = readDef(agentPath(role));

      const result = sut.attrs.effort;

      assert.equal(result, resolveCodexEffort(tier));
    });
  }
});

describe('entrypoint skill — plugins/craft-codex/skills/craft-run/SKILL.md', () => {
  it('Given the entrypoint skill, when frontmatter is parsed, then it carries a non-empty name', () => {
    const sut = readDef(ENTRYPOINT_SKILL_PATH);

    assert.ok(sut.attrs.name && sut.attrs.name.length > 0);
  });

  it('Given the entrypoint skill, when frontmatter is parsed, then it carries a non-empty description', () => {
    const sut = readDef(ENTRYPOINT_SKILL_PATH);

    assert.ok(sut.attrs.description && sut.attrs.description.length > 0);
  });

  it('Given the entrypoint skill, when scanned, then it explicitly asks for multi_agent_v1 subagent delegation', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /multi_agent_v1/);
    assert.match(sut, /spawn_agent/);
  });

  it('Given the entrypoint skill, when scanned, then it states the usable fan-out width is 3', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /\b3\b.*(concurrent|fan-out|worker)|(concurrent|fan-out|worker).*\b3\b/i);
  });

  it('Given the entrypoint skill, when scanned, then it defers to skills/run/SKILL.md rather than restating the procedure', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.match(sut, /skills\/run\/SKILL\.md/);
  });

  it('Given the entrypoint skill, when its line count is measured, then it stays under the small-file budget (does not restate the procedure)', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8').split('\n').length;

    assert.ok(sut < ENTRYPOINT_LINE_BUDGET, `entrypoint skill is ${sut} lines, expected < ${ENTRYPOINT_LINE_BUDGET}`);
  });

  it('Given the entrypoint skill, when scanned, then it carries the CRAFT_ROOT/CLAUDE_PLUGIN_ROOT shim', () => {
    const sut = readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8');

    assert.ok(sut.includes(PLUGIN_ROOT_SHIM));
  });
});

// Hygiene surfaces. Every authored adapter surface, no carve-out.
function agentBodies() {
  return ROLES.map((role) => ({ label: `agents/craft-${role}.md`, text: bodyOf(agentPath(role)) }));
}

function authoredSurfaces() {
  return [
    { label: 'README.md', text: readFileSync(README_PATH, 'utf8') },
    { label: 'config.template.toml', text: readFileSync(CONFIG_TEMPLATE_PATH, 'utf8') },
    { label: 'hooks.json', text: readFileSync(HOOKS_JSON_PATH, 'utf8') },
    { label: 'craft.rules', text: readFileSync(CRAFT_RULES_PATH, 'utf8') },
    { label: 'marketplace.json', text: readFileSync(MARKETPLACE_PATH, 'utf8') },
    { label: 'plugins/craft/plugin.json', text: readFileSync(CRAFT_PLUGIN_PATH, 'utf8') },
    { label: 'plugins/craft-codex/plugin.json', text: readFileSync(CRAFT_CODEX_PLUGIN_PATH, 'utf8') },
    { label: 'plugins/craft-codex/skills/craft-run/SKILL.md', text: readFileSync(ENTRYPOINT_SKILL_PATH, 'utf8') },
  ];
}

describe('hygiene — no shell-injection expansion, over every authored surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when the text is scanned, then it carries no shell-injection expansion`, () => {
      const sut = text;

      assert.doesNotMatch(sut, SHELL_INJECTION_PATTERN);
    });
  }
});

describe('hygiene — no phase/ADR/backlog reference, over every authored surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when the text is scanned, then it carries no phase/ADR/backlog reference`, () => {
      const sut = text;

      assert.doesNotMatch(sut, PROVENANCE_REF);
    });
  }
});

describe('hygiene — ${CLAUDE_PLUGIN_ROOT} confined to the CRAFT_ROOT shim, over every authored surface', () => {
  for (const { label, text } of [...agentBodies(), ...authoredSurfaces()]) {
    it(`Given ${label}, when every CRAFT_ROOT shim occurrence is stripped, then no bare \${CLAUDE_PLUGIN_ROOT} token remains`, () => {
      const sut = text.split(PLUGIN_ROOT_SHIM).join('');

      assert.doesNotMatch(sut, PLUGIN_ROOT_TOKEN);
    });
  }
});

describe('README.md — honesty pins', () => {
  it('Given README.md, when scanned, then it discloses the git -C . push execpolicy bypass', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /git -C/);
  });

  it('Given README.md, when scanned, then it states a malformed .rules file may fail open', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /fail open/i);
  });

  it('Given README.md, when scanned, then it states per-sandbox-mode blocking was not measured', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /not measured/i);
  });

  it('Given README.md, when scanned, then it names --dangerously-bypass-hook-trust', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /--dangerously-bypass-hook-trust/);
  });

  it('Given README.md, when scanned, then it documents the $CODEX_HOME/skills symlink fallback route', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /\$CODEX_HOME\/skills/);
  });

  it('Given README.md, when scanned, then it documents the mandatory install-time hook-trust step', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /trust/i);
    assert.match(sut, /silently no-ops|silent no-op/i);
  });

  it('Given README.md, when scanned, then it states --ephemeral is never passed', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /--ephemeral/);
  });

  it('Given README.md, when scanned, then it shows the ./-prefixed local marketplace source form and discloses the shorthand misresolution', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /codex plugin marketplace add \.\/adapters\/codex/);
    assert.match(sut, /owner\/repo/);
  });

  it('Given README.md, when scanned, then it documents the scriptable trust path and its read-only check', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /bin\/trust-hook\.js/);
    assert.match(sut, /--check/);
  });
});
