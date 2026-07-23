import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ADAPTER_DIR, '..', '..');
const SHARED_AGENTS_DIR = join(REPO_ROOT, 'agents');
const README_PATH = join(ADAPTER_DIR, 'README.md');
const CONFIG_TEMPLATE_PATH = join(ADAPTER_DIR, 'config.template.yml');

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

function bodyOf(filePath) {
  return parseFrontmatter(readFileSync(filePath, 'utf8')).body;
}

function sharedAgentPath(role) {
  return join(SHARED_AGENTS_DIR, `${role}.md`);
}

function aiderAgentPath(role) {
  return join(ADAPTER_DIR, 'agents', `craft-${role}.md`);
}

describe('craft-<role>.md agent files — body-only, byte-identical to shared craft sources', () => {
  for (const role of ROLES) {
    it(`Given aider agent craft-${role}.md, when its raw bytes are compared to the shared craft source body, then the two are byte-identical`, () => {
      const sut = readFileSync(aiderAgentPath(role), 'utf8');

      const result = bodyOf(sharedAgentPath(role));

      assert.equal(sut, result);
    });

    it(`Given aider agent craft-${role}.md, when its first bytes are scanned, then it carries no frontmatter fence`, () => {
      const sut = readFileSync(aiderAgentPath(role), 'utf8');

      assert.doesNotMatch(sut, /^---/);
    });
  }
});

describe('README.md — Aider honesty pins (measured against the pinned live contract)', () => {
  it('Given README.md, when scanned, then it states guard is NO-GO because there is no deny-capable pre-execution hook', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /NO-GO/);
    assert.match(sut, /no deny-capable pre-execution hook/i);
  });

  it('Given README.md, when scanned, then it states the shell surface is unsandboxed (measured)', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /unsandboxed/i);
    assert.match(sut, /measured/i);
  });

  it('Given README.md, when scanned, then it states exit code is not the success signal — the commit is', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /exit code is not/i);
    assert.match(sut, /commit is the success signal/i);
  });

  it('Given README.md, when scanned, then it states the git-ext-diff predicate is moot because Aider drives git internally', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /git-ext-diff predicate/i);
    assert.match(sut, /moot/i);
    assert.match(sut, /drives git internally/i);
  });

  it('Given README.md, when scanned, then it documents auth as env/file, not keychain', () => {
    const sut = readFileSync(README_PATH, 'utf8');

    assert.match(sut, /env(\/|\s|-)?(var)?.*file/i);
    assert.match(sut, /not.{0,10}keychain/i);
  });
});

describe('config.template.yml — plain-text .aider.conf.yml template posture', () => {
  it('Given the config template, when scanned, then it carries the non-interactive + telemetry posture keys', () => {
    const sut = readFileSync(CONFIG_TEMPLATE_PATH, 'utf8');

    assert.match(sut, /yes-always:\s*true/);
    assert.match(sut, /gitignore:\s*false/);
    assert.match(sut, /check-update:\s*false/);
    assert.match(sut, /show-release-notes:\s*false/);
    assert.match(sut, /analytics:\s*false/);
  });

  it('Given the config template, when scanned, then it carries the VCS posture keys', () => {
    const sut = readFileSync(CONFIG_TEMPLATE_PATH, 'utf8');

    assert.match(sut, /auto-commits:\s*true/);
    assert.match(sut, /dirty-commits:\s*false/);
    assert.match(sut, /attribute-author:\s*false/);
    assert.match(sut, /attribute-committer:\s*false/);
    assert.match(sut, /attribute-co-authored-by:\s*false/);
  });

  it('Given the config template, when scanned, then it reads CONVENTIONS.md', () => {
    const sut = readFileSync(CONFIG_TEMPLATE_PATH, 'utf8');

    assert.match(sut, /read:\s*\[CONVENTIONS\.md\]/);
  });

  it('Given the config template, when scanned, then its models block carries the three live-pinned tier ids', () => {
    const sut = readFileSync(CONFIG_TEMPLATE_PATH, 'utf8');

    assert.match(sut, /models:/);
    assert.match(sut, /anthropic\/claude-opus-4-6/);
    assert.match(sut, /anthropic\/claude-sonnet-4-6/);
    assert.match(sut, /anthropic\/claude-haiku-4-5/);
  });
});

describe('hygiene — no provenance reference or shell-injection expansion over the authored non-agent surfaces', () => {
  for (const label of ['README.md', 'config.template.yml']) {
    it(`Given ${label}, when scanned, then it carries no phase/ADR/backlog reference and no shell-injection expansion`, () => {
      const sut = readFileSync(join(ADAPTER_DIR, label), 'utf8');

      assert.doesNotMatch(sut, PROVENANCE_REF);
      assert.doesNotMatch(sut, SHELL_INJECTION_PATTERN);
    });
  }
});

describe('hygiene — agent bodies carry no shell-injection expansion and no provenance reference', () => {
  for (const role of ROLES) {
    it(`Given aider agent craft-${role}.md body, when scanned, then it carries no shell-injection expansion`, () => {
      const sut = readFileSync(aiderAgentPath(role), 'utf8');

      assert.doesNotMatch(sut, SHELL_INJECTION_PATTERN);
    });

    it(`Given aider agent craft-${role}.md body, when scanned, then it carries no phase/ADR/backlog reference`, () => {
      const sut = readFileSync(aiderAgentPath(role), 'utf8');

      assert.doesNotMatch(sut, PROVENANCE_REF);
    });
  }
});
