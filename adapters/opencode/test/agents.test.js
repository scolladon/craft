import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveOpencodeModel } from '../src/model-tier-map.js';

const ADAPTER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_DIR = path.join(ADAPTER_DIR, 'agents');
const REPO_ROOT = path.join(ADAPTER_DIR, '..', '..');
const SHARED_AGENTS_DIR = path.join(REPO_ROOT, 'agents');

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

const PLUGIN_ROOT_TOKEN = /\$\{CLAUDE_PLUGIN_ROOT\}/;
const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;

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
    const match = /^([a-zA-Z_]+):\s?(.*)$/.exec(line);
    if (match) {
      attrs[match[1]] = match[2].trim();
    }
  }

  const body = lines.slice(closeIndex + 1).join('\n').replace(/^\n+/, '');
  return { attrs, body };
}

function readAgentDef(role) {
  const filePath = path.join(AGENTS_DIR, `craft-${role}.md`);
  const content = readFileSync(filePath, 'utf8');
  return parseFrontmatter(content);
}

function sharedAgentPath(role) {
  return path.join(SHARED_AGENTS_DIR, `${role}.md`);
}

function bodyOf(filePath) {
  return parseFrontmatter(readFileSync(filePath, 'utf8')).body;
}

/** Parse the nested `permission:` map (2-space-indented `key: allow|ask|deny` lines). */
function parsePermission(content) {
  const lines = content.split('\n');
  const start = lines.indexOf('permission:');
  if (start === -1) {
    return {};
  }
  const permission = {};
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) {
      break; // dedent (or the closing --- fence) ends the block
    }
    const match = /^\s+([a-z_]+):\s*(allow|ask|deny)\s*$/.exec(line);
    if (match) {
      permission[match[1]] = match[2];
    }
  }
  return permission;
}

function readPermission(role) {
  const filePath = path.join(AGENTS_DIR, `craft-${role}.md`);
  return parsePermission(readFileSync(filePath, 'utf8'));
}

describe('craft-<role>.md agent bodies — byte-identical to shared craft sources', () => {
  for (const role of ROLES) {
    it(`Given agent craft-${role}.md, when its body is compared to the shared craft source, then the two are byte-identical`, () => {
      const sut = readAgentDef(role).body;

      const result = bodyOf(sharedAgentPath(role));

      assert.equal(sut, result);
    });
  }
});

describe('craft-<role>.md — file existence', () => {
  for (const role of ROLES) {
    it(`Given role "${role}", when reading agents/craft-${role}.md, then the file exists`, () => {
      const sut = readAgentDef;

      const result = () => sut(role);

      assert.doesNotThrow(result);
    });
  }
});

describe('craft-<role>.md — frontmatter contract', () => {
  for (const role of ROLES) {
    it(`Given craft-${role}.md, when frontmatter is parsed, then description is non-empty`, () => {
      const sut = readAgentDef(role);

      const result = sut.attrs.description;

      assert.ok(result && result.length > 0);
    });

    it(`Given craft-${role}.md, when frontmatter is parsed, then mode is "subagent"`, () => {
      const sut = readAgentDef(role);

      const result = sut.attrs.mode;

      assert.equal(result, 'subagent');
    });

    it(`Given craft-${role}.md, when frontmatter is parsed, then model is set`, () => {
      const sut = readAgentDef(role);

      const result = sut.attrs.model;

      assert.ok(result && result.length > 0);
    });
  }
});

describe('craft-<role>.md — model tier consistency with model-tier-map.js', () => {
  for (const [role, tier] of Object.entries(ROLE_TIERS)) {
    it(`Given role "${role}" pinned to tier "${tier}", when compared to resolveOpencodeModel(), then the frontmatter model matches the tier map`, () => {
      const sut = readAgentDef(role);

      const result = sut.attrs.model;

      assert.equal(result, resolveOpencodeModel(tier));
    });
  }
});

describe('craft-<role>.md — permission capability contract', () => {
  const COMMITTING_ROLES = [
    'designer', 'planner', 'requirements-writer', 'part-implementer',
    'refactor-executor', 'harness-triager', 'docs-writer',
  ];
  const ALWAYS_DENIED = ['task', 'question', 'webfetch', 'websearch', 'external_directory'];

  for (const role of COMMITTING_ROLES) {
    it(`Given committing role "${role}", when permissions are parsed, then bash is allow (artifact-is-the-handoff: the worker commits its own artifact)`, () => {
      const result = readPermission(role);

      assert.equal(result.bash, 'allow');
    });
  }

  it('Given the read-only reviewer, when permissions are parsed, then edit is deny', () => {
    const result = readPermission('reviewer');

    assert.equal(result.edit, 'deny');
  });

  it('Given the backlog-ticker (the session commits its flip, not the ticker), when permissions are parsed, then bash is deny', () => {
    const result = readPermission('backlog-ticker');

    assert.equal(result.bash, 'deny');
  });

  for (const role of ROLES) {
    for (const capability of ALWAYS_DENIED) {
      it(`Given role "${role}", when permissions are parsed, then ${capability} is deny (least-privilege; depth-1 topology)`, () => {
        const result = readPermission(role);

        assert.equal(result[capability], 'deny');
      });
    }
  }
});

describe('craft-<role>.md — body provenance hygiene', () => {
  for (const role of ROLES) {
    it(`Given craft-${role}.md, when the body is scanned, then it carries no \${CLAUDE_PLUGIN_ROOT} token`, () => {
      const sut = readAgentDef(role);

      const result = sut.body;

      assert.doesNotMatch(result, PLUGIN_ROOT_TOKEN);
    });

    it(`Given craft-${role}.md, when the body is scanned, then it carries no phase/ADR/backlog reference`, () => {
      const sut = readAgentDef(role);

      const result = sut.body;

      assert.doesNotMatch(result, PROVENANCE_REF);
    });
  }
});
